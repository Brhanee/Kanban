import hashlib
import hmac
import secrets
import sqlite3
from contextlib import contextmanager
from pathlib import Path
from typing import Iterator
from uuid import uuid4

DEFAULT_DATABASE_PATH = Path(__file__).resolve().parents[1] / "data" / "pm.sqlite3"
DEMO_USERNAME = "user"
DEMO_PASSWORD = "password"
HASH_ITERATIONS = 180_000

DEFAULT_COLUMNS = (
    ("Backlog",),
    ("Discovery",),
    ("In Progress",),
    ("Review",),
    ("Done",),
)

DEFAULT_CARDS = (
    ("Align roadmap themes", "Draft quarterly themes with impact statements and metrics.", 0),
    ("Gather customer signals", "Review support tags, sales notes, and churn feedback.", 0),
    ("Prototype analytics view", "Sketch initial dashboard layout and key drill-downs.", 1),
    ("Refine status language", "Standardize column labels and tone across the board.", 2),
    ("Design card layout", "Add hierarchy and spacing for scanning dense lists.", 2),
    ("QA micro-interactions", "Verify hover, focus, and loading states.", 3),
    ("Ship marketing page", "Final copy approved and asset pack delivered.", 4),
    ("Close onboarding sprint", "Document release notes and share internally.", 4),
)


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac(
        "sha256", password.encode("utf-8"), salt, HASH_ITERATIONS
    )
    return f"pbkdf2_sha256${HASH_ITERATIONS}${salt.hex()}${digest.hex()}"


def verify_password(password: str, stored_hash: str) -> bool:
    try:
        algorithm, iterations, salt_hex, digest_hex = stored_hash.split("$")
        if algorithm != "pbkdf2_sha256":
            return False
        candidate = hashlib.pbkdf2_hmac(
            "sha256", password.encode("utf-8"), bytes.fromhex(salt_hex), int(iterations)
        ).hex()
    except (ValueError, TypeError):
        return False
    return hmac.compare_digest(candidate, digest_hex)


@contextmanager
def database_connection(path: Path) -> Iterator[sqlite3.Connection]:
    path.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(path)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")
    try:
        with connection:
            yield connection
    finally:
        connection.close()


def initialize_database(path: Path) -> None:
    with database_connection(path) as connection:
        connection.executescript(
            """
            CREATE TABLE IF NOT EXISTS users (
                id TEXT PRIMARY KEY NOT NULL,
                username TEXT NOT NULL UNIQUE,
                password_hash TEXT NOT NULL,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS boards (
                id TEXT PRIMARY KEY NOT NULL,
                user_id TEXT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
                title TEXT NOT NULL,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS board_columns (
                id TEXT PRIMARY KEY NOT NULL,
                board_id TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
                title TEXT NOT NULL,
                position INTEGER NOT NULL CHECK(position >= 0),
                UNIQUE(board_id, position)
            );

            CREATE TABLE IF NOT EXISTS cards (
                id TEXT PRIMARY KEY NOT NULL,
                column_id TEXT NOT NULL REFERENCES board_columns(id) ON DELETE CASCADE,
                title TEXT NOT NULL,
                details TEXT NOT NULL DEFAULT '',
                position INTEGER NOT NULL CHECK(position >= 0),
                UNIQUE(column_id, position)
            );

            CREATE INDEX IF NOT EXISTS board_columns_order
                ON board_columns(board_id, position);
            CREATE INDEX IF NOT EXISTS cards_order
                ON cards(column_id, position);
            """
        )

        user = connection.execute(
            "SELECT id FROM users WHERE username = ?", (DEMO_USERNAME,)
        ).fetchone()
        if user is None:
            user_id = str(uuid4())
            connection.execute(
                "INSERT INTO users (id, username, password_hash) VALUES (?, ?, ?)",
                (user_id, DEMO_USERNAME, hash_password(DEMO_PASSWORD)),
            )
        else:
            user_id = user["id"]

        board = connection.execute(
            "SELECT id FROM boards WHERE user_id = ?", (user_id,)
        ).fetchone()
        if board is not None:
            return

        board_id = str(uuid4())
        connection.execute(
            "INSERT INTO boards (id, user_id, title) VALUES (?, ?, ?)",
            (board_id, user_id, "Kanban Studio"),
        )
        column_ids: list[str] = []
        for position, (title,) in enumerate(DEFAULT_COLUMNS):
            column_id = str(uuid4())
            column_ids.append(column_id)
            connection.execute(
                "INSERT INTO board_columns (id, board_id, title, position) "
                "VALUES (?, ?, ?, ?)",
                (column_id, board_id, title, position),
            )

        next_positions = [0] * len(column_ids)
        for title, details, column_position in DEFAULT_CARDS:
            connection.execute(
                "INSERT INTO cards (id, column_id, title, details, position) "
                "VALUES (?, ?, ?, ?, ?)",
                (
                    str(uuid4()),
                    column_ids[column_position],
                    title,
                    details,
                    next_positions[column_position],
                ),
            )
            next_positions[column_position] += 1