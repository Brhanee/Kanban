"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import type { BoardData } from "@/lib/kanban";

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

type ChatResponse = {
  response: string;
  board: BoardData;
  detail?: unknown;
};

type AIAssistantProps = {
  open: boolean;
  token: string;
  onClose: () => void;
  onBoardUpdated: (board: BoardData) => void;
};

export const AIAssistant = ({
  open,
  token,
  onClose,
  onBoardUpdated,
}: AIAssistantProps) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");
  const [isSending, setIsSending] = useState(false);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      composerRef.current?.focus();
    }
  }, [open]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView?.({ behavior: "smooth", block: "end" });
  }, [messages, isSending]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const message = draft.trim();
    if (!message || isSending) {
      return;
    }

    const conversation = messages.slice(-20);
    setMessages((current) => [...current, { role: "user", content: message }]);
    setDraft("");
    setError("");
    setIsSending(true);

    try {
      const response = await fetch("/api/ai/chat", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ message, conversation }),
      });
      const payload = (await response.json().catch(() => null)) as ChatResponse | null;

      if (!response.ok) {
        throw new Error(
          typeof payload?.detail === "string"
            ? payload.detail
            : "The assistant request failed."
        );
      }
      if (!payload || typeof payload.response !== "string" || !payload.board) {
        throw new Error("The assistant returned an invalid response.");
      }

      onBoardUpdated(payload.board);
      setMessages((current) => [
        ...current,
        { role: "assistant", content: payload.response },
      ]);
    } catch (requestError) {
      setError(
        requestError instanceof Error && requestError.message
          ? requestError.message
          : "Could not reach the assistant. Try again."
      );
    } finally {
      setIsSending(false);
    }
  };

  if (!open) {
    return null;
  }

  return (
    <>
      <button
        type="button"
        aria-label="Close AI assistant"
        onClick={onClose}
        className="fixed inset-0 z-40 cursor-default bg-[rgba(3,33,71,0.28)]"
      />
      <aside
        id="ai-assistant-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="ai-assistant-title"
        className="fixed inset-y-0 right-0 z-50 flex w-full max-w-[420px] flex-col border-l border-[var(--stroke)] bg-[var(--surface-strong)] shadow-2xl"
      >
        <header className="flex items-center justify-between border-b border-[var(--stroke)] px-5 py-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--gray-text)]">
              Kanban Studio
            </p>
            <h2 id="ai-assistant-title" className="mt-1 font-display text-xl font-semibold text-[var(--navy-dark)]">
              AI Assistant
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-[var(--stroke)] px-3 py-2 text-sm font-semibold text-[var(--navy-dark)] transition hover:bg-[var(--surface)]"
          >
            Close
          </button>
        </header>

        <div
          aria-live="polite"
          className="flex-1 space-y-4 overflow-y-auto px-4 py-5"
        >
          {messages.length === 0 ? (
            <p className="max-w-[280px] rounded-2xl border border-[var(--stroke)] bg-[var(--surface)] px-4 py-3 text-sm leading-6 text-[var(--navy-dark)]">
              What should we work on next?
            </p>
          ) : (
            messages.map((message, index) => (
              <div
                key={`${message.role}-${index}`}
                className={`max-w-[88%] whitespace-pre-wrap rounded-2xl px-4 py-3 text-sm leading-6 ${
                  message.role === "user"
                    ? "ml-auto bg-[var(--navy-dark)] text-white"
                    : "mr-auto border border-[var(--stroke)] bg-[var(--surface)] text-[var(--navy-dark)]"
                }`}
              >
                {message.content}
              </div>
            ))
          )}
          {isSending ? (
            <p role="status" className="mr-auto rounded-2xl bg-[var(--surface)] px-4 py-3 text-sm text-[var(--gray-text)]">
              Thinking...
            </p>
          ) : null}
          <div ref={messagesEndRef} />
        </div>

        <form onSubmit={handleSubmit} className="space-y-3 border-t border-[var(--stroke)] p-4">
          {error ? (
            <p role="alert" className="text-sm font-medium text-red-700">
              {error}
            </p>
          ) : null}
          <label htmlFor="ai-assistant-message" className="sr-only">
            Message the assistant
          </label>
          <textarea
            ref={composerRef}
            id="ai-assistant-message"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Ask a question or request a board change"
            maxLength={4000}
            rows={3}
            disabled={isSending}
            className="w-full resize-none rounded-xl border border-[var(--stroke)] bg-white px-3 py-3 text-sm leading-6 text-[var(--navy-dark)] outline-none transition placeholder:text-[var(--gray-text)] focus:border-[var(--primary-blue)] disabled:opacity-60"
          />
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs text-[var(--gray-text)]">
              {draft.length}/4000
            </span>
            <button
              type="submit"
              disabled={!draft.trim() || isSending}
              className="rounded-lg bg-[var(--primary-blue)] px-5 py-2.5 text-sm font-semibold text-white transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isSending ? "Sending..." : "Send"}
            </button>
          </div>
        </form>
      </aside>
    </>
  );
};
