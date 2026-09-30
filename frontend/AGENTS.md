# Frontend agent guide

## Purpose
This directory contains the Next.js frontend for the PM MVP. The app currently demonstrates a client-side Kanban board and is intended to evolve into a production-like project management interface with login, persistence, and AI-assisted board updates.

## Project structure
- src/app/page.tsx: the homepage entrypoint; it renders the Kanban board.
- src/components/: UI components for the board, cards, forms, and drag/drop behavior.
- src/lib/kanban.ts: the board data model and drag logic.
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
- five default columns
- card creation and deletion
- drag/drop card movement between columns
- inline column renaming
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

The drag logic is centralized in moveCard(), which handles card movement inside a column and across columns.

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

The unit tests in src/components/KanbanBoard.test.tsx validate:
- the board renders five columns
- a column can be renamed
- a card can be added and removed

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
