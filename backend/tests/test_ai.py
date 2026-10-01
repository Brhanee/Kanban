import json

import httpx
import pytest
from fastapi.testclient import TestClient

from app.main import create_app


@pytest.fixture
def client(tmp_path):
    app = create_app(tmp_path / "ai-test.sqlite3")
    with TestClient(app) as test_client:
        yield test_client


def login(client: TestClient) -> dict[str, str]:
    response = client.post(
        "/api/auth/login", json={"username": "user", "password": "password"}
    )
    assert response.status_code == 200
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


class FakeResponse:
    def __init__(self, payload: object, status_code: int = 200) -> None:
        self.payload = payload
        self.status_code = status_code

    def raise_for_status(self) -> None:
        if self.status_code >= 400:
            request = httpx.Request("POST", "https://openrouter.ai/api/v1/chat/completions")
            response = httpx.Response(self.status_code, request=request)
            raise httpx.HTTPStatusError(
                "Upstream request failed", request=request, response=response
            )

    def json(self) -> object:
        return self.payload


class FakeAsyncClient:
    response: FakeResponse
    request: tuple[str, dict[str, object]] | None = None

    def __init__(self, **kwargs: object) -> None:
        del kwargs

    async def __aenter__(self):
        return self

    async def __aexit__(self, *args: object) -> None:
        del args

    async def post(self, url: str, **kwargs: object) -> FakeResponse:
        type(self).request = (url, kwargs)
        return self.response


class NetworkErrorAsyncClient(FakeAsyncClient):
    async def post(self, url: str, **kwargs: object) -> FakeResponse:
        del url, kwargs
        raise httpx.ConnectError("Connection refused")


def test_ai_connectivity_sends_expected_request_and_returns_response(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("OPENROUTER_API_KEY", "test-key")
    FakeAsyncClient.response = FakeResponse(
        {"choices": [{"message": {"content": "4"}}]}
    )
    monkeypatch.setattr("app.ai.httpx.AsyncClient", FakeAsyncClient)

    response = client.post("/api/ai/connectivity", headers=login(client))

    assert response.status_code == 200
    assert response.json() == {"response": "4"}
    url, request = FakeAsyncClient.request
    assert url == "https://openrouter.ai/api/v1/chat/completions"
    assert request["headers"] == {"Authorization": "Bearer test-key"}
    assert request["json"]["model"] == "openai/gpt-oss-120b"
    assert request["json"]["max_tokens"] == 128


def test_ai_chat_sends_board_and_conversation_context(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("OPENROUTER_API_KEY", "test-key")
    FakeAsyncClient.response = FakeResponse(
        {
            "choices": [
                {
                    "message": {
                        "content": json.dumps({"response": "Priorities look clear.", "actions": []})
                    }
                }
            ]
        }
    )
    monkeypatch.setattr("app.ai.httpx.AsyncClient", FakeAsyncClient)
    headers = login(client)

    board = client.get("/api/board", headers=headers).json()
    response = client.post(
        "/api/ai/chat",
        headers=headers,
        json={
            "message": "What should I focus on?",
            "conversation": [{"role": "user", "content": "Help me plan."}],
        },
    )

    assert response.status_code == 200
    assert response.json()["response"] == "Priorities look clear."
    assert response.json()["actions"] == []
    assert response.json()["board"] == board
    _, request = FakeAsyncClient.request
    messages = request["json"]["messages"]
    assert "Align roadmap themes" in messages[0]["content"]
    assert messages[1] == {"role": "user", "content": "Help me plan."}
    assert messages[2] == {"role": "user", "content": "What should I focus on?"}
    assert request["json"]["response_format"]["type"] == "json_schema"


def test_ai_chat_applies_structured_board_actions(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("OPENROUTER_API_KEY", "test-key")
    headers = login(client)
    original_board = client.get("/api/board", headers=headers).json()
    backlog, discovery = original_board["columns"][:2]
    first_card_id, deleted_card_id = backlog["cardIds"][:2]
    FakeAsyncClient.response = FakeResponse(
        {
            "choices": [
                {
                    "message": {
                        "content": json.dumps(
                            {
                                "response": "I updated the board.",
                                "actions": [
                                    {
                                        "operation": "create_card",
                                        "card_id": None,
                                        "column_id": backlog["id"],
                                        "title": "Draft launch checklist",
                                        "details": "",
                                        "position": None,
                                    },
                                    {
                                        "operation": "update_card",
                                        "card_id": first_card_id,
                                        "column_id": None,
                                        "title": "Align product roadmap",
                                        "details": None,
                                        "position": None,
                                    },
                                    {
                                        "operation": "move_card",
                                        "card_id": first_card_id,
                                        "column_id": discovery["id"],
                                        "title": None,
                                        "details": None,
                                        "position": 0,
                                    },
                                    {
                                        "operation": "delete_card",
                                        "card_id": deleted_card_id,
                                        "column_id": None,
                                        "title": None,
                                        "details": None,
                                        "position": None,
                                    },
                                    {
                                        "operation": "rename_column",
                                        "card_id": None,
                                        "column_id": discovery["id"],
                                        "title": "AI Review",
                                        "details": None,
                                        "position": None,
                                    },
                                ],
                            }
                        )
                    }
                }
            ]
        }
    )
    monkeypatch.setattr("app.ai.httpx.AsyncClient", FakeAsyncClient)

    response = client.post(
        "/api/ai/chat", headers=headers, json={"message": "Update my launch plan."}
    )

    assert response.status_code == 200
    updated_board = response.json()["board"]
    assert updated_board["cards"][first_card_id]["title"] == "Align product roadmap"
    assert deleted_card_id not in updated_board["cards"]
    assert any(
        card["title"] == "Draft launch checklist"
        for card in updated_board["cards"].values()
    )
    assert updated_board["columns"][1]["title"] == "AI Review"
    assert first_card_id in updated_board["columns"][1]["cardIds"]
    assert client.get("/api/board", headers=headers).json() == updated_board


def test_ai_chat_rejects_malformed_model_output(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("OPENROUTER_API_KEY", "test-key")
    FakeAsyncClient.response = FakeResponse(
        {"choices": [{"message": {"content": '{"response":"unfinished"'}}]}
    )
    monkeypatch.setattr("app.ai.httpx.AsyncClient", FakeAsyncClient)

    response = client.post(
        "/api/ai/chat", headers=login(client), json={"message": "Make a plan."}
    )

    assert response.status_code == 502
    assert response.json()["detail"] == "OpenRouter returned an invalid response"


def test_ai_chat_rejects_invalid_actions_without_partial_changes(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("OPENROUTER_API_KEY", "test-key")
    headers = login(client)
    original_board = client.get("/api/board", headers=headers).json()
    backlog_id = original_board["columns"][0]["id"]
    FakeAsyncClient.response = FakeResponse(
        {
            "choices": [
                {
                    "message": {
                        "content": json.dumps(
                            {
                                "response": "I added a card.",
                                "actions": [
                                    {
                                        "operation": "create_card",
                                        "card_id": None,
                                        "column_id": backlog_id,
                                        "title": "Temporary card",
                                        "details": "",
                                        "position": None,
                                    },
                                    {
                                        "operation": "create_card",
                                        "card_id": None,
                                        "column_id": "not-on-this-board",
                                        "title": "Invalid card",
                                        "details": "",
                                        "position": None,
                                    },
                                ],
                            }
                        )
                    }
                }
            ]
        }
    )
    monkeypatch.setattr("app.ai.httpx.AsyncClient", FakeAsyncClient)

    response = client.post(
        "/api/ai/chat", headers=headers, json={"message": "Add two cards."}
    )

    assert response.status_code == 502
    assert response.json()["detail"] == "AI proposed an invalid board update"
    assert client.get("/api/board", headers=headers).json() == original_board


def test_ai_chat_requires_authentication(client: TestClient) -> None:
    response = client.post("/api/ai/chat", json={"message": "Plan this board."})

    assert response.status_code == 401


def test_ai_connectivity_requires_authentication(client: TestClient) -> None:
    response = client.post("/api/ai/connectivity")

    assert response.status_code == 401


def test_ai_connectivity_reports_missing_api_key(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.delenv("OPENROUTER_API_KEY", raising=False)

    response = client.post("/api/ai/connectivity", headers=login(client))

    assert response.status_code == 503
    assert response.json()["detail"] == "OPENROUTER_API_KEY is not configured"


def test_ai_connectivity_handles_network_failure(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("OPENROUTER_API_KEY", "test-key")
    monkeypatch.setattr("app.ai.httpx.AsyncClient", NetworkErrorAsyncClient)

    response = client.post("/api/ai/connectivity", headers=login(client))

    assert response.status_code == 502
    assert response.json()["detail"] == "OpenRouter request failed"


@pytest.mark.parametrize(
    ("upstream_response", "expected_detail"),
    [
        (FakeResponse({}, status_code=503), "OpenRouter request failed"),
        (FakeResponse({"choices": []}), "OpenRouter returned an invalid response"),
    ],
)
def test_ai_connectivity_handles_upstream_errors(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
    upstream_response: FakeResponse,
    expected_detail: str,
) -> None:
    monkeypatch.setenv("OPENROUTER_API_KEY", "test-key")
    FakeAsyncClient.response = upstream_response
    monkeypatch.setattr("app.ai.httpx.AsyncClient", FakeAsyncClient)

    response = client.post("/api/ai/connectivity", headers=login(client))

    assert response.status_code == 502
    assert response.json()["detail"] == expected_detail