import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import Home from "@/app/page";

describe("Home login flow", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
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
  });
});
