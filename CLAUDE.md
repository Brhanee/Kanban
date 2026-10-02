# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md
@backend/AGENTS.md
@frontend/AGENTS.md

The imported `AGENTS.md` files hold the requirements, color scheme and coding standards. Follow them strictly: keep things simple, add no extra features, use no emojis, and prove a bug's root cause before fixing it. `docs/PLAN.md` tracks progress through phases 0-9 with checklists; update it when finishing planned work. `docs/database-schema.json` is the authoritative SQLite schema.

## Commands

Backend (from `backend/`, Python 3.12, uv):
- `uv run --group dev pytest -q` - all backend tests
- `uv run --group dev pytest tests/test_persistence.py -k move -q` - a single test
- `uv run uvicorn app.main:app --port 8000 --reload` - run the app (this is what `scripts/start.sh` / `start.ps1` do; `stop.*` kills whatever is listening on port 8000, including the `--reload` child process)

Frontend (from `frontend/`):
- `npm run build` - static export to `frontend/out/`, which the backend serves
- `npm run lint`
- `npm run test:unit` - Vitest (`src/**/*.test.ts(x)`); `npx vitest run src/lib/kanban.test.ts` for one file
- `npm run test:e2e` - Playwright (`tests/`, Chromium; starts `next dev` on 127.0.0.1:3000)
- `npm run test:all`

Docker: `docker compose up --build` serves everything on http://localhost:8000. Compose reads `OPENROUTER_API_KEY` from the root `.env`.

## How the pieces fit

- One origin. Next.js is built with `output: "export"`, and FastAPI serves `frontend/out/` (`/_next` mount plus a catch-all fallback to `index.html`). The frontend calls the API with relative `/api/...` paths. `next dev` has no proxy to the backend, so:
  - To exercise the real stack locally, run `npm run build`, then start the backend and open port 8000. Without a build, `/` serves the placeholder `backend/app/static/index.html`.
  - The Playwright tests run against `next dev` and mock every `/api/*` call with `page.route`. They do not hit the backend.
- The API routes in `app/api.py` (prefix `/api`) must be registered before the catch-all frontend route in `app/main.py`.
- `create_app(database_path)` is a factory. Tests pass a temporary SQLite path; the default DB is `backend/data/pm.sqlite3`, created and seeded on startup (lifespan).
- Auth: `POST /api/auth/login` returns a bearer token stored in `app.state.sessions` (memory only, so a restart logs everyone out). The frontend keeps it in `localStorage` and sends it on every board request.
- Data shape: the DB is normalized (users, boards, board_columns, cards with `position`). `board_data_for_id` assembles the frontend's `BoardData` (`columns[].cardIds` plus a `cards` map). Keep that contract stable; see `docs/DATA_MODEL.md`.
- AI flow (`POST /api/ai/chat`):
  1. The backend sends the board JSON plus the conversation to OpenRouter (`openai/gpt-oss-120b`, `app/ai.py`), requesting structured output that matches the Pydantic `AssistantResponse` schema.
  2. It validates the returned `actions` (create/update/move/delete card, rename column).
  3. `apply_ai_actions` applies them inside one DB transaction, so an invalid action rolls back the whole batch.
  4. The response returns the updated board, and `AIAssistant.tsx` replaces local state with it.
  The frontend never applies AI actions itself.
- The running server needs `OPENROUTER_API_KEY`. The start scripts pass the root `.env` to uvicorn (`--env-file`), and Compose reads it. A bare `uv run uvicorn` does not, so you have to add `--env-file ../.env` yourself. The AI tests stub the HTTP call and need no key.
- Board edits save on commit, not on every keystroke. A column title is saved on Enter or blur (Escape cancels), and a card is saved through its Edit form. Never send a request per keystroke: every save reloads the whole board.
- dnd-kit's `attributes` put `role="button"` and `aria-disabled` on the card. `KanbanCard` drops both the attributes and the listeners while editing, so the form inside stays usable.
