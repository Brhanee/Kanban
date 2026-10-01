import secrets
import sqlite3
from typing import Annotated
from uuid import uuid4

from fastapi import APIRouter, Depends, Header, HTTPException, Request, Response
from pydantic import BaseModel, Field

from app.ai import (
    BoardAction,
    ConversationMessage,
    ask_board_assistant,
    test_openrouter_connection,
)
from app.database import database_connection, verify_password

router = APIRouter(prefix="/api")


class LoginRequest(BaseModel):
    username: str
    password: str


class CardCreate(BaseModel):
    column_id: str = Field(min_length=1)
    title: str = Field(min_length=1)
    details: str = ""


class CardUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1)
    details: str | None = None


class ColumnUpdate(BaseModel):
    title: str = Field(min_length=1)


class CardMove(BaseModel):
    column_id: str = Field(min_length=1)
    position: int = Field(ge=0)


class AIChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=4000)
    conversation: list[ConversationMessage] = Field(default_factory=list, max_length=20)


def current_user_id(
    request: Request,
    authorization: Annotated[str | None, Header()] = None,
) -> str:
    scheme, _, token = (authorization or "").partition(" ")
    user_id = request.app.state.sessions.get(token) if scheme.lower() == "bearer" else None
    if user_id is None:
        raise HTTPException(
            status_code=401,
            detail="Authentication required",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return user_id


def board_id_for_user(connection: sqlite3.Connection, user_id: str) -> str:
    board = connection.execute(
        "SELECT id FROM boards WHERE user_id = ?", (user_id,)
    ).fetchone()
    if board is None:
        raise HTTPException(status_code=404, detail="Board not found")
    return board["id"]


def owned_column(
    connection: sqlite3.Connection, column_id: str, board_id: str
) -> sqlite3.Row:
    column = connection.execute(
        "SELECT id FROM board_columns WHERE id = ? AND board_id = ?",
        (column_id, board_id),
    ).fetchone()
    if column is None:
        raise HTTPException(status_code=404, detail="Column not found")
    return column


def touch_board(connection: sqlite3.Connection, board_id: str) -> None:
    connection.execute(
        "UPDATE boards SET updated_at = CURRENT_TIMESTAMP WHERE id = ?", (board_id,)
    )


def assign_positions(
    connection: sqlite3.Connection, column_id: str, card_ids: list[str]
) -> None:
    maximum = connection.execute(
        "SELECT COALESCE(MAX(position), -1) FROM cards WHERE column_id = ?",
        (column_id,),
    ).fetchone()[0]
    offset = maximum + len(card_ids) + 2
    connection.execute(
        "UPDATE cards SET position = position + ? WHERE column_id = ?",
        (offset, column_id),
    )
    for position, card_id in enumerate(card_ids):
        connection.execute(
            "UPDATE cards SET position = ? WHERE id = ?", (position, card_id)
        )


def board_data_for_id(
    connection: sqlite3.Connection, board_id: str
) -> dict[str, object]:
    columns = connection.execute(
        "SELECT id, title FROM board_columns WHERE board_id = ? ORDER BY position",
        (board_id,),
    ).fetchall()
    cards: dict[str, dict[str, str]] = {}
    board_columns: list[dict[str, object]] = []
    for column in columns:
        column_cards = connection.execute(
            "SELECT id, title, details FROM cards "
            "WHERE column_id = ? ORDER BY position",
            (column["id"],),
        ).fetchall()
        card_ids = [card["id"] for card in column_cards]
        board_columns.append(
            {"id": column["id"], "title": column["title"], "cardIds": card_ids}
        )
        cards.update(
            {
                card["id"]: {
                    "id": card["id"],
                    "title": card["title"],
                    "details": card["details"],
                }
                for card in column_cards
            }
        )
    return {"columns": board_columns, "cards": cards}


def move_card_in_board(
    connection: sqlite3.Connection,
    board_id: str,
    card_id: str,
    target_column_id: str,
    position: int,
) -> int:
    owned_column(connection, target_column_id, board_id)
    card = connection.execute(
        "SELECT cards.column_id FROM cards "
        "JOIN board_columns ON board_columns.id = cards.column_id "
        "WHERE cards.id = ? AND board_columns.board_id = ?",
        (card_id, board_id),
    ).fetchone()
    if card is None:
        raise HTTPException(status_code=404, detail="Card not found")

    source_column_id = card["column_id"]
    source_ids = [
        row["id"]
        for row in connection.execute(
            "SELECT id FROM cards WHERE column_id = ? ORDER BY position",
            (source_column_id,),
        ).fetchall()
    ]
    source_ids.remove(card_id)
    if source_column_id == target_column_id:
        target_ids = source_ids
    else:
        target_ids = [
            row["id"]
            for row in connection.execute(
                "SELECT id FROM cards WHERE column_id = ? ORDER BY position",
                (target_column_id,),
            ).fetchall()
        ]
    target_position = min(position, len(target_ids))
    target_ids.insert(target_position, card_id)

    if source_column_id == target_column_id:
        assign_positions(connection, source_column_id, target_ids)
    else:
        maximum = connection.execute(
            "SELECT COALESCE(MAX(position), -1) FROM cards "
            "WHERE column_id IN (?, ?)",
            (source_column_id, target_column_id),
        ).fetchone()[0]
        offset = maximum + len(source_ids) + len(target_ids) + 2
        connection.execute(
            "UPDATE cards SET position = position + ? "
            "WHERE column_id IN (?, ?)",
            (offset, source_column_id, target_column_id),
        )
        connection.execute(
            "UPDATE cards SET column_id = ?, position = ? WHERE id = ?",
            (target_column_id, offset * 2, card_id),
        )
        assign_positions(connection, source_column_id, source_ids)
        assign_positions(connection, target_column_id, target_ids)
    return target_position


def invalid_ai_action() -> HTTPException:
    return HTTPException(status_code=502, detail="AI proposed an invalid board update")


def apply_ai_actions(
    connection: sqlite3.Connection, board_id: str, actions: list[BoardAction]
) -> None:
    for action in actions:
        if action.operation == "create_card":
            if not action.column_id or not action.title or not action.title.strip():
                raise invalid_ai_action()
            try:
                owned_column(connection, action.column_id, board_id)
            except HTTPException as error:
                raise invalid_ai_action() from error
            position = connection.execute(
                "SELECT COALESCE(MAX(position), -1) + 1 FROM cards WHERE column_id = ?",
                (action.column_id,),
            ).fetchone()[0]
            connection.execute(
                "INSERT INTO cards (id, column_id, title, details, position) "
                "VALUES (?, ?, ?, ?, ?)",
                (
                    str(uuid4()),
                    action.column_id,
                    action.title,
                    action.details or "",
                    position,
                ),
            )
        elif action.operation == "update_card":
            if not action.card_id:
                raise invalid_ai_action()
            card = connection.execute(
                "SELECT cards.id FROM cards "
                "JOIN board_columns ON board_columns.id = cards.column_id "
                "WHERE cards.id = ? AND board_columns.board_id = ?",
                (action.card_id, board_id),
            ).fetchone()
            changes: dict[str, str] = {}
            if action.title is not None:
                if not action.title.strip():
                    raise invalid_ai_action()
                changes["title"] = action.title
            if action.details is not None:
                changes["details"] = action.details
            if card is None or not changes:
                raise invalid_ai_action()
            assignments = ", ".join(f"{field} = ?" for field in changes)
            connection.execute(
                f"UPDATE cards SET {assignments} WHERE id = ?",
                (*changes.values(), action.card_id),
            )
        elif action.operation == "move_card":
            if (
                not action.card_id
                or not action.column_id
                or action.position is None
                or action.position < 0
            ):
                raise invalid_ai_action()
            try:
                move_card_in_board(
                    connection,
                    board_id,
                    action.card_id,
                    action.column_id,
                    action.position,
                )
            except HTTPException as error:
                raise invalid_ai_action() from error
        elif action.operation == "delete_card":
            if not action.card_id:
                raise invalid_ai_action()
            card = connection.execute(
                "SELECT cards.column_id FROM cards "
                "JOIN board_columns ON board_columns.id = cards.column_id "
                "WHERE cards.id = ? AND board_columns.board_id = ?",
                (action.card_id, board_id),
            ).fetchone()
            if card is None:
                raise invalid_ai_action()
            connection.execute("DELETE FROM cards WHERE id = ?", (action.card_id,))
            remaining = connection.execute(
                "SELECT id FROM cards WHERE column_id = ? ORDER BY position",
                (card["column_id"],),
            ).fetchall()
            assign_positions(connection, card["column_id"], [row["id"] for row in remaining])
        elif action.operation == "rename_column":
            if not action.column_id or not action.title or not action.title.strip():
                raise invalid_ai_action()
            try:
                owned_column(connection, action.column_id, board_id)
            except HTTPException as error:
                raise invalid_ai_action() from error
            connection.execute(
                "UPDATE board_columns SET title = ? WHERE id = ?",
                (action.title, action.column_id),
            )
    if actions:
        touch_board(connection, board_id)


@router.post("/auth/login")
def login(payload: LoginRequest, request: Request) -> dict[str, str]:
    with database_connection(request.app.state.database_path) as connection:
        user = connection.execute(
            "SELECT id, password_hash FROM users WHERE username = ?",
            (payload.username,),
        ).fetchone()
    if user is None or not verify_password(payload.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid username or password")

    token = secrets.token_urlsafe(32)
    request.app.state.sessions[token] = user["id"]
    return {"access_token": token, "token_type": "bearer"}


@router.post("/ai/connectivity")
async def ai_connectivity(
    user_id: Annotated[str, Depends(current_user_id)],
) -> dict[str, str]:
    del user_id
    return await test_openrouter_connection()


@router.post("/ai/chat")
async def ai_chat(
    payload: AIChatRequest,
    request: Request,
    user_id: Annotated[str, Depends(current_user_id)],
) -> dict[str, object]:
    if not payload.message.strip():
        raise HTTPException(status_code=422, detail="Message cannot be empty")

    with database_connection(request.app.state.database_path) as connection:
        board_id = board_id_for_user(connection, user_id)
        board = board_data_for_id(connection, board_id)

    assistant_response = await ask_board_assistant(
        board, payload.message, payload.conversation
    )

    with database_connection(request.app.state.database_path) as connection:
        board_id = board_id_for_user(connection, user_id)
        apply_ai_actions(connection, board_id, assistant_response.actions)
        updated_board = board_data_for_id(connection, board_id)

    return {
        "response": assistant_response.response,
        "actions": [action.model_dump() for action in assistant_response.actions],
        "board": updated_board,
    }


@router.post("/auth/logout", status_code=204)
def logout(
    request: Request,
    user_id: Annotated[str, Depends(current_user_id)],
    authorization: Annotated[str | None, Header()] = None,
) -> Response:
    del user_id
    _, _, token = (authorization or "").partition(" ")
    request.app.state.sessions.pop(token, None)
    return Response(status_code=204)


@router.get("/board")
def read_board(
    request: Request, user_id: Annotated[str, Depends(current_user_id)]
) -> dict[str, object]:
    with database_connection(request.app.state.database_path) as connection:
        board_id = board_id_for_user(connection, user_id)
        return board_data_for_id(connection, board_id)


@router.post("/cards", status_code=201)
def create_card(
    payload: CardCreate,
    request: Request,
    user_id: Annotated[str, Depends(current_user_id)],
) -> dict[str, str]:
    with database_connection(request.app.state.database_path) as connection:
        board_id = board_id_for_user(connection, user_id)
        owned_column(connection, payload.column_id, board_id)
        position = connection.execute(
            "SELECT COALESCE(MAX(position), -1) + 1 FROM cards WHERE column_id = ?",
            (payload.column_id,),
        ).fetchone()[0]
        card_id = str(uuid4())
        connection.execute(
            "INSERT INTO cards (id, column_id, title, details, position) "
            "VALUES (?, ?, ?, ?, ?)",
            (card_id, payload.column_id, payload.title, payload.details, position),
        )
        touch_board(connection, board_id)
    return {"id": card_id, "title": payload.title, "details": payload.details}


@router.patch("/cards/{card_id}")
def update_card(
    card_id: str,
    payload: CardUpdate,
    request: Request,
    user_id: Annotated[str, Depends(current_user_id)],
) -> dict[str, str]:
    changes = payload.model_dump(exclude_unset=True)
    if not changes or any(value is None for value in changes.values()):
        raise HTTPException(status_code=422, detail="Provide a title or details value")
    if "title" in changes and not changes["title"].strip():
        raise HTTPException(status_code=422, detail="Card title cannot be empty")

    with database_connection(request.app.state.database_path) as connection:
        board_id = board_id_for_user(connection, user_id)
        card = connection.execute(
            "SELECT cards.id, cards.title, cards.details FROM cards "
            "JOIN board_columns ON board_columns.id = cards.column_id "
            "WHERE cards.id = ? AND board_columns.board_id = ?",
            (card_id, board_id),
        ).fetchone()
        if card is None:
            raise HTTPException(status_code=404, detail="Card not found")
        assignments = ", ".join(f"{field} = ?" for field in changes)
        connection.execute(
            f"UPDATE cards SET {assignments} WHERE id = ?",
            (*changes.values(), card_id),
        )
        touch_board(connection, board_id)
        updated = connection.execute(
            "SELECT id, title, details FROM cards WHERE id = ?", (card_id,)
        ).fetchone()
    return dict(updated)


@router.delete("/cards/{card_id}", status_code=204)
def delete_card(
    card_id: str,
    request: Request,
    user_id: Annotated[str, Depends(current_user_id)],
) -> Response:
    with database_connection(request.app.state.database_path) as connection:
        board_id = board_id_for_user(connection, user_id)
        card = connection.execute(
            "SELECT cards.column_id FROM cards "
            "JOIN board_columns ON board_columns.id = cards.column_id "
            "WHERE cards.id = ? AND board_columns.board_id = ?",
            (card_id, board_id),
        ).fetchone()
        if card is None:
            raise HTTPException(status_code=404, detail="Card not found")
        connection.execute("DELETE FROM cards WHERE id = ?", (card_id,))
        remaining = connection.execute(
            "SELECT id FROM cards WHERE column_id = ? ORDER BY position",
            (card["column_id"],),
        ).fetchall()
        assign_positions(connection, card["column_id"], [row["id"] for row in remaining])
        touch_board(connection, board_id)
    return Response(status_code=204)


@router.patch("/columns/{column_id}")
def rename_column(
    column_id: str,
    payload: ColumnUpdate,
    request: Request,
    user_id: Annotated[str, Depends(current_user_id)],
) -> dict[str, str]:
    if not payload.title.strip():
        raise HTTPException(status_code=422, detail="Column title cannot be empty")
    with database_connection(request.app.state.database_path) as connection:
        board_id = board_id_for_user(connection, user_id)
        owned_column(connection, column_id, board_id)
        connection.execute(
            "UPDATE board_columns SET title = ? WHERE id = ?",
            (payload.title, column_id),
        )
        touch_board(connection, board_id)
    return {"id": column_id, "title": payload.title}


@router.post("/cards/{card_id}/move")
def move_card(
    card_id: str,
    payload: CardMove,
    request: Request,
    user_id: Annotated[str, Depends(current_user_id)],
) -> dict[str, object]:
    with database_connection(request.app.state.database_path) as connection:
        board_id = board_id_for_user(connection, user_id)
        target_position = move_card_in_board(
            connection, board_id, card_id, payload.column_id, payload.position
        )
        touch_board(connection, board_id)
    return {
        "id": card_id,
        "column_id": payload.column_id,
        "position": target_position,
    }