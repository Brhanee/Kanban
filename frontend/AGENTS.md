# Frontend agent guide

## Purpose
This directory contains the Next.js frontend for the PM MVP. It is built as a static export (`out/`) and served by the FastAPI backend, which owns all board state.

## Project structure
- src/app/page.tsx: sign-in, token storage, and every board API call (each change is saved, then the board is reloaded).
- src/components/: UI components for the board, cards, forms, drag/drop, and the AI assistant sidebar.
- src/lib/kanban.ts: the board types, plus demo data and a client-side moveCard() used only when KanbanBoard is rendered without props (unit tests).
- src/test/setup.ts: shared Vitest setup for the frontend tests.
- tests/: browser-level Playwright coverage for the app.

## Current implementation
The app uses:
- Next.js 16
- React 19
- @dnd-kit for drag-and-drop interactions
- Vitest + Testing Library for unit coverage
- Playwright for browser tests

The present board includes:
- sign-in and logout
- five default columns
- card creation, editing, and deletion
- drag/drop card movement between columns
- inline column renaming (saved on Enter or blur)
- an AI assistant sidebar that can change the board
- a styled dashboard layout with the project color system

## Key data model
The board state is represented in src/lib/kanban.ts as:
- BoardData
  - columns: an ordered list of columns
  - cards: a record keyed by card id
- Column
  - id
  - title
  - cardIds
- Card
  - id
  - title
  - details

With the backend connected, a drop sends the target column and position to `/api/cards/{id}/move`, and the backend reorders the cards.

## Important patterns
- Use client components for interactive drag and board state updates.
- Keep state management local to components unless the app layer requires shared API-backed state.
- Preserve the existing visual design language and color variables.
- Prefer simple, explicit code paths over abstraction that is not needed for the MVP.
- Keep tests focused on real user behavior, not mock-only behaviors.

## Testing
Run the frontend checks with:
- npm run test
- npm run test:e2e
- npm run test:all

Unit tests (src/**/*.test.tsx) cover the board, column renaming, card editing, login, and the AI chat. Playwright tests (tests/) run against `next dev` with every `/api` call mocked by `page.route`.

## Agent guidance
When changing this frontend:
1. Start from the current board model and keep data shapes consistent.
2. Add the smallest UI change that satisfies the requirement.
3. Verify any drag/drop or form update with relevant tests.
4. Preserve accessible labels and test IDs where they are already present.
5. Keep the existing design aesthetic unless a requirement explicitly changes the UX.

## Non-goals for this directory
- Do not add large architectural patterns or framework churn.
- Do not redesign the app beyond the existing vision unless the user explicitly approves it.
- Do not add backend logic here; keep the frontend focused on UI, state, and user interactions.
