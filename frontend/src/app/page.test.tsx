import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import Home from "@/app/page";

describe("Home login flow", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("requires valid credentials before showing the board and allows logout", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn();
    fetchMock.mockResolvedValueOnce({
      ok: false,
      json: async () => ({ detail: "Invalid username or password" }),
    });
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ access_token: "demo-token", token_type: "bearer" }),
    });
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        columns: [
          { id: "todo", title: "Todo", cardIds: ["card-1"] },
          { id: "done", title: "Done", cardIds: [] },
        ],
        cards: {
          "card-1": { id: "card-1", title: "Seeded card", details: "Fetched from API" },
        },
      }),
    });

    vi.stubGlobal("fetch", fetchMock);
    render(<Home />);

    const usernameInput = screen.getByLabelText(/username/i);
    const passwordInput = screen.getByLabelText(/password/i);

    await user.type(usernameInput, "wrong");
    await user.type(passwordInput, "wrong");
    await user.click(screen.getByRole("button", { name: /log in/i }));

    expect(screen.getByText(/invalid username or password/i)).toBeInTheDocument();
    expect(screen.queryByText(/kanban studio/i)).not.toBeInTheDocument();

    await user.clear(usernameInput);
    await user.clear(passwordInput);
    await user.type(usernameInput, "user");
    await user.type(passwordInput, "password");
    await user.click(screen.getByRole("button", { name: /log in/i }));

    const loginRequests = fetchMock.mock.calls.filter(([url]) => url === "/api/auth/login");
    const loginRequest = loginRequests[loginRequests.length - 1];
    expect(loginRequest).toBeDefined();
    expect(loginRequest?.[1]).toMatchObject({
      method: "POST",
      body: JSON.stringify({ username: "user", password: "password" }),
    });
    expect(screen.getByText(/kanban studio/i)).toBeInTheDocument();
    expect(screen.getByText("Seeded card")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /log out/i }));
    expect(screen.getByLabelText(/username/i)).toBeInTheDocument();
  }, 10_000);

  it("sends a chat message and displays the AI-updated board", async () => {
    const user = userEvent.setup();
    const initialBoard = {
      columns: [{ id: "todo", title: "Todo", cardIds: ["card-1"] }],
      cards: {
        "card-1": { id: "card-1", title: "Seeded card", details: "Original" },
      },
    };
    const updatedBoard = {
      columns: [{ id: "todo", title: "Todo", cardIds: ["card-1", "ai-card"] }],
      cards: {
        ...initialBoard.cards,
        "ai-card": { id: "ai-card", title: "AI-created card", details: "Added by AI" },
      },
    };
    const fetchMock = vi.fn();
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => initialBoard,
    });
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        response: "I added a card.",
        actions: [{ operation: "create_card" }],
        board: updatedBoard,
      }),
    });
    vi.stubGlobal("fetch", fetchMock);
    localStorage.setItem("pm-access-token", "demo-token");

    render(<Home />);

    await screen.findByText("Seeded card");
    await user.click(screen.getByRole("button", { name: "AI Assistant" }));
    await user.type(
      screen.getByRole("textbox", { name: "Message the assistant" }),
      "Add a planning task"
    );
    await user.click(screen.getByRole("button", { name: "Send" }));

    expect(await screen.findByText("I added a card.")).toBeInTheDocument();
    expect(await screen.findByText("AI-created card")).toBeInTheDocument();
    const chatRequest = fetchMock.mock.calls.find(([url]) => url === "/api/ai/chat");
    expect(chatRequest?.[1]).toMatchObject({
      method: "POST",
      headers: {
        Authorization: "Bearer demo-token",
        "Content-Type": "application/json",
      },
    });
    expect(JSON.parse(chatRequest?.[1]?.body as string)).toEqual({
      message: "Add a planning task",
      conversation: [],
    });
  });

  it("shows an error when the AI chat request fails", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn();
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ columns: [], cards: {} }),
    });
    fetchMock.mockResolvedValueOnce({
      ok: false,
      json: async () => ({ detail: "OpenRouter request failed" }),
    });
    vi.stubGlobal("fetch", fetchMock);
    localStorage.setItem("pm-access-token", "demo-token");

    render(<Home />);

    await user.click(await screen.findByRole("button", { name: "AI Assistant" }));
    await user.type(
      screen.getByRole("textbox", { name: "Message the assistant" }),
      "Help me plan"
    );
    await user.click(screen.getByRole("button", { name: "Send" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "OpenRouter request failed"
    );
  });
});
