"use client";

import { useCallback, useEffect, useState } from "react";
import { AIAssistant } from "@/components/AIAssistant";
import { KanbanBoard } from "@/components/KanbanBoard";
import type { BoardData } from "@/lib/kanban";

const STORAGE_KEY = "pm-access-token";

async function fetchJson<T>(url: string, options: RequestInit = {}, token?: string): Promise<T> {
  const headers = new Headers(options.headers ?? {});
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  if (options.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(url, {
    ...options,
    headers,
  });

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(payload?.detail ?? "Request failed");
  }

  return payload as T;
}

export default function Home() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [boardError, setBoardError] = useState("");
  const [token, setToken] = useState<string | null>(null);
  const [board, setBoard] = useState<BoardData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isCheckingSession, setIsCheckingSession] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isAssistantOpen, setIsAssistantOpen] = useState(false);

  const loadBoard = useCallback(
    async (currentToken: string) => {
      const nextBoard = await fetchJson<BoardData>("/api/board", {}, currentToken);
      setBoard(nextBoard);
    },
    []
  );

  const runBoardAction = async (action: () => Promise<void>) => {
    setBoardError("");
    try {
      await action();
    } catch (requestError) {
      setBoardError(
        requestError instanceof Error && requestError.message
          ? requestError.message
          : "Board changes could not be saved."
      );
    }
  };

  useEffect(() => {
    const storedToken = window.localStorage.getItem(STORAGE_KEY);
    if (!storedToken) {
      setIsCheckingSession(false);
      return;
    }

    setToken(storedToken);
    void loadBoard(storedToken)
      .then(() => setIsAuthenticated(true))
      .catch(() => {
        window.localStorage.removeItem(STORAGE_KEY);
        setToken(null);
        setError("Your session expired. Please sign in again.");
      })
      .finally(() => {
        setIsCheckingSession(false);
      });
  }, [loadBoard]);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsLoading(true);
    setError("");

    try {
      const result = await fetchJson<{ access_token: string; token_type: string }>(
        "/api/auth/login",
        {
          method: "POST",
          body: JSON.stringify({ username, password }),
        }
      );

      const nextToken = result.access_token;
      window.localStorage.setItem(STORAGE_KEY, nextToken);
      setToken(nextToken);
      await loadBoard(nextToken);
      setIsAuthenticated(true);
    } catch (requestError) {
      setIsAuthenticated(false);
      setError(
        requestError instanceof Error && requestError.message
          ? requestError.message
          : "Invalid username or password"
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogout = () => {
    window.localStorage.removeItem(STORAGE_KEY);
    setIsAuthenticated(false);
    setToken(null);
    setBoard(null);
    setUsername("");
    setPassword("");
    setError("");
    setIsAssistantOpen(false);
  };

  const handleMoveCard = async (activeCardId: string, overId: string) => {
    if (!token || !board) {
      return;
    }

    const activeColumn = board.columns.find((column) => column.cardIds.includes(activeCardId));
    const overColumn = board.columns.find((column) => column.id === overId || column.cardIds.includes(overId));

    if (!activeColumn || !overColumn) {
      return;
    }

    const targetPosition = overColumn.cardIds.includes(overId)
      ? overColumn.cardIds.indexOf(overId)
      : overColumn.cardIds.length;

    await runBoardAction(async () => {
      await fetchJson(`/api/cards/${activeCardId}/move`, {
        method: "POST",
        body: JSON.stringify({
          column_id: overColumn.id,
          position: targetPosition,
        }),
      }, token);

      await loadBoard(token);
    });
  };

  const handleRenameColumn = async (columnId: string, title: string) => {
    if (!token) {
      return;
    }

    await runBoardAction(async () => {
      await fetchJson(`/api/columns/${columnId}`, {
        method: "PATCH",
        body: JSON.stringify({ title }),
      }, token);

      await loadBoard(token);
    });
  };

  const handleAddCard = async (columnId: string, title: string, details: string) => {
    if (!token) {
      return;
    }

    await runBoardAction(async () => {
      await fetchJson("/api/cards", {
        method: "POST",
        body: JSON.stringify({ column_id: columnId, title, details }),
      }, token);

      await loadBoard(token);
    });
  };

  const handleDeleteCard = async (columnId: string, cardId: string) => {
    if (!token) {
      return;
    }

    await runBoardAction(async () => {
      await fetchJson(`/api/cards/${cardId}`, {
        method: "DELETE",
      }, token);

      await loadBoard(token);
    });
  };

  if (!isAuthenticated) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-100 px-4 py-10">
        {isCheckingSession ? (
          <p role="status" className="text-sm font-medium text-[var(--gray-text)]">
            Loading your board...
          </p>
        ) : (
        <form
          onSubmit={handleSubmit}
          className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-8 shadow-lg"
        >
          <div className="mb-6 text-center">
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[var(--gray-text)]">
              Project Management
            </p>
            <h1 className="mt-3 text-3xl font-bold text-[var(--navy-dark)]">
              Sign in
            </h1>
          </div>

          <div className="space-y-5">
            <div>
              <label htmlFor="username" className="mb-2 block text-sm font-medium text-slate-700">
                Username
              </label>
              <input
                id="username"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                className="w-full rounded-xl border border-slate-300 px-3 py-2 outline-none ring-0 transition focus:border-[var(--primary-blue)]"
                placeholder="user"
              />
            </div>

            <div>
              <label htmlFor="password" className="mb-2 block text-sm font-medium text-slate-700">
                Password
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="w-full rounded-xl border border-slate-300 px-3 py-2 outline-none transition focus:border-[var(--primary-blue)]"
                placeholder="password"
              />
            </div>
          </div>

          {error ? (
            <p className="mt-4 text-sm font-medium text-red-600">{error}</p>
          ) : null}

          <button
            type="submit"
            disabled={isLoading}
            className="mt-6 w-full rounded-xl bg-[var(--secondary-purple)] px-4 py-3 font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {isLoading ? "Signing in..." : "Log in"}
          </button>
        </form>
        )}
      </main>
    );
  }

  return (
    <div className="relative">
      {boardError ? (
        <p
          role="alert"
          className="absolute left-6 top-6 z-20 max-w-[calc(100%-9rem)] rounded-lg border border-red-200 bg-white px-3 py-2 text-sm font-medium text-red-700 shadow-sm"
        >
          {boardError}
        </p>
      ) : null}
      <div className="absolute right-6 top-6 z-10">
        <button
          type="button"
          onClick={handleLogout}
          className="rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm"
        >
          Log out
        </button>
      </div>
      <KanbanBoard
        board={board ?? undefined}
        assistantOpen={isAssistantOpen}
        onToggleAssistant={() => setIsAssistantOpen((open) => !open)}
        onMoveCard={handleMoveCard}
        onRenameColumn={handleRenameColumn}
        onAddCard={handleAddCard}
        onDeleteCard={handleDeleteCard}
      />
      {token ? (
        <AIAssistant
          open={isAssistantOpen}
          token={token}
          onClose={() => setIsAssistantOpen(false)}
          onBoardUpdated={setBoard}
        />
      ) : null}
    </div>
  );
}
