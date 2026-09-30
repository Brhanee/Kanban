import pytest
from fastapi.testclient import TestClient

from app.main import create_app


@pytest.fixture
def client(tmp_path):
    app = create_app(tmp_path / "test.sqlite3")
    with TestClient(app) as test_client:
        yield test_client


def login(client: TestClient) -> dict[str, str]:
    response = client.post(
        "/api/auth/login", json={"username": "user", "password": "password"}
    )
    assert response.status_code == 200
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


def test_board_api_requires_authentication(client: TestClient) -> None:
    response = client.get("/api/board")
    assert response.status_code == 401


def test_invalid_login_is_rejected(client: TestClient) -> None:
    response = client.post(
        "/api/auth/login", json={"username": "user", "password": "wrong"}
    )
    assert response.status_code == 401


def test_logout_revokes_bearer_token(client: TestClient) -> None:
    headers = login(client)
    response = client.post("/api/auth/logout", headers=headers)
    assert response.status_code == 204
    assert client.get("/api/board", headers=headers).status_code == 401


def test_board_and_card_column_operations(client: TestClient) -> None:
    headers = login(client)
    board = client.get("/api/board", headers=headers).json()
    assert len(board["columns"]) == 5
    assert len(board["cards"]) == 8

    backlog_id = board["columns"][0]["id"]
    discovery_id = board["columns"][1]["id"]
    first_backlog_card_id = board["columns"][0]["cardIds"][0]
    reordered = client.post(
        f"/api/cards/{first_backlog_card_id}/move",
        headers=headers,
        json={"column_id": backlog_id, "position": 1},
    )
    assert reordered.status_code == 200
    board = client.get("/api/board", headers=headers).json()
    assert board["columns"][0]["cardIds"][1] == first_backlog_card_id

    created = client.post(
        "/api/cards",
        headers=headers,
        json={"column_id": backlog_id, "title": "New card", "details": "Initial notes"},
    )
    assert created.status_code == 201
    card_id = created.json()["id"]

    updated = client.patch(
        f"/api/cards/{card_id}",
        headers=headers,
        json={"title": "Updated card", "details": "Updated notes"},
    )
    assert updated.json()["title"] == "Updated card"
    assert updated.json()["details"] == "Updated notes"

    moved = client.post(
        f"/api/cards/{card_id}/move",
        headers=headers,
        json={"column_id": discovery_id, "position": 1},
    )
    assert moved.status_code == 200
    assert moved.json()["position"] == 1

    renamed = client.patch(
        f"/api/columns/{discovery_id}",
        headers=headers,
        json={"title": "Research"},
    )
    assert renamed.json() == {"id": discovery_id, "title": "Research"}

    board = client.get("/api/board", headers=headers).json()
    assert board["columns"][1]["title"] == "Research"
    assert board["columns"][1]["cardIds"][1] == card_id
    assert board["cards"][card_id]["title"] == "Updated card"

    deleted = client.delete(f"/api/cards/{card_id}", headers=headers)
    assert deleted.status_code == 204
    board = client.get("/api/board", headers=headers).json()
    assert card_id not in board["cards"]
    assert card_id not in board["columns"][1]["cardIds"]


def test_board_changes_survive_app_restart(tmp_path) -> None:
    database_path = tmp_path / "persistent.sqlite3"
    first_app = create_app(database_path)
    with TestClient(first_app) as first_client:
        headers = login(first_client)
        board = first_client.get("/api/board", headers=headers).json()
        column_id = board["columns"][0]["id"]
        created = first_client.post(
            "/api/cards",
            headers=headers,
            json={"column_id": column_id, "title": "Persist me"},
        )
        card_id = created.json()["id"]

    second_app = create_app(database_path)
    with TestClient(second_app) as second_client:
        headers = login(second_client)
        board = second_client.get("/api/board", headers=headers).json()
        assert board["cards"][card_id]["title"] == "Persist me"