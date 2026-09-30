# Project plan for the PM MVP

## Goal
Build a locally hosted project management application with a signed-in Kanban board, a Python FastAPI backend, a Next.js frontend, and an AI-powered planning assistant. The repo already contains a working frontend prototype, and this plan expands it into a complete, testable MVP.

## Working assumptions
- The current frontend is a demo-only UI with drag-and-drop Kanban interactions already implemented.
- The app will run locally in Docker.
- The MVP uses a hardcoded sign-in flow for user/password.
- The database will be SQLite and designed to support multiple users in the future.
- AI integration will use OpenRouter with the model openai/gpt-oss-120b.
- The project must remain simple and production-like without unnecessary complexity.

## Phase 0: Plan approval gate

### Checklist
- [ ] Review this plan with the user.
- [ ] Confirm requirements, scope, and acceptance criteria.
- [ ] Get explicit approval before starting implementation beyond the planning phase.

### Success criteria
- The user agrees that the roadmap, features, and validation steps match expectations.
- The team has a single source of truth for which tasks belong to each milestone.

---

## Phase 1: Repository scaffolding and local runtime

### Objective
Set up the Docker infrastructure, Python backend skeleton, and shell scripts so the project can run locally and confirm a basic hello-world response before feature work begins.

### Checklist
- [ ] Create or update Docker configuration for the app container.
- [ ] Set up a Python backend directory with FastAPI.
- [ ] Add a simple hello-world endpoint to verify the backend starts.
- [ ] Serve static HTML or a minimal frontend placeholder from the backend to prove local delivery works.
- [ ] Add start/stop scripts for Windows, Mac, and Linux under scripts/.
- [ ] Document expected startup commands and ports.
- [ ] Verify both a browser-level static response and an API response work locally.

### Tests
- [ ] Start the app locally.
- [ ] Confirm the root route responds successfully.
- [ ] Confirm the API endpoint returns the expected payload.
- [ ] Confirm script-based startup and shutdown complete without errors.

### Success criteria
- The app starts with a single command or script.
- The root route serves content successfully.
- The API responds at a known endpoint, proving backend connectivity.
- No container or local startup failures remain.

---

## Phase 2: Frontend integration and static serving

### Objective
Turn the existing frontend demo into a production-ready static site served by the app, with the Kanban board displayed at /.

### Checklist
- [ ] Review the existing Next.js app in frontend/ and keep the current useful UI elements.
- [ ] Ensure the app builds correctly for production.
- [ ] Configure the backend to serve the built frontend static output.
- [ ] Confirm the app loads at / and renders the Kanban board.
- [ ] Keep the configured styling system and color scheme from the current design.
- [ ] Add or update tests covering the core board render.

### Tests
- [ ] Run frontend unit tests for board rendering.
- [ ] Run a browser-level check that the homepage displays the board.
- [ ] Validate that the app builds without warnings that block deployment.

### Success criteria
- The homepage loads the Kanban board at /.
- The app is served through the project runtime rather than running only as a standalone frontend dev server.
- Unit tests cover the basic board behavior and render path.

---

## Phase 3: Fake authentication workflow

### Objective
Add a simple sign-in gate using the dummy credentials user / password before access to the Kanban board.

### Checklist
- [ ] Add a login screen that is shown before the user reaches the board.
- [ ] Implement authentication with the hardcoded credentials user and password.
- [ ] Show an error state for invalid credentials.
- [ ] Add a logout action once the board is visible.
- [ ] Ensure unauthenticated users cannot access the board content.
- [ ] Add tests for login success, invalid login, and logout flow.

### Tests
- [ ] Submit valid credentials and confirm the board appears.
- [ ] Submit invalid credentials and confirm the login error is shown.
- [ ] Log out and confirm the user is returned to the login state.

### Success criteria
- The Kanban board is inaccessible until the user signs in.
- The fake login flow feels reliable and testable.
- The state transitions are covered by automated tests.

---

## Phase 4: Database modeling and schema review

### Objective
Define a SQLite-backed Kanban database schema that supports multiple users now and future growth.

### Checklist
- [x] Define the data model for users, boards, columns, cards, and optional AI conversation history.
- [x] Save the schema as a JSON file in docs/.
- [x] Document the schema and app data flow.
- [x] Confirm the design is compatible with the MVP requirements.
- [x] Present the schema to the user for approval before full backend implementation.

### Tests
- [x] Validate the JSON schema is syntactically valid.
- [x] Review the model against the current frontend board structure.
- [x] Confirm the design supports one board per user and simple future expansion.

### Success criteria
- The database model maps cleanly to the board structure.
- The user approves the planned persistence layer.
- The backend implementation can be built from this schema without major rework.

---

## Phase 5: Backend API for kanban persistence

### Objective
Add backend routes to read and modify the Kanban data for a specific user, creating the database file when it is missing.

### Checklist
- [x] Create SQLite tables for user and board data.
- [x] Add endpoints to fetch the board for the signed-in user.
- [x] Add endpoints to add, update, and delete cards.
- [x] Add endpoints to rename columns and move cards between columns.
- [x] Handle the case where the database does not exist yet.
- [x] Add backend unit tests covering both happy-path and edge-case behavior.

### Tests
- [x] Database bootstraps successfully on first run.
- [x] Board loads correctly and returns valid JSON.
- [x] Card create/update/delete operations work.
- [x] Column rename and move actions maintain board integrity.

### Success criteria
- The backend is the source of truth for Kanban state.
- Data persistence works across requests.
- Core API flows are covered by automated tests.

---

## Phase 6: Frontend connected to backend API

### Objective
Replace the in-memory front-end board with persistent backend-backed state.

### Checklist
- [ ] Connect the frontend to the backend routes.
- [ ] Load board data from the API on page load.
- [ ] Save changes to the board after card moves, deletes, additions, and renames.
- [ ] Handle loading and error states.
- [ ] Ensure the authenticated user context is used when loading the board.
- [ ] Add end-to-end tests covering major board actions.

### Tests
- [ ] Initial board load fetches from the backend.
- [ ] A created card is persisted and remains after refresh.
- [ ] A moved card persists correctly.
- [ ] Errors are surfaced without crashing the app.

### Success criteria
- The UI is still usable and visually consistent.
- Data persists across user actions and reloads.
- The frontend and backend agree on the board state.

---

## Phase 7: AI connectivity

### Objective
Connect the backend to OpenRouter and prove the external AI call works.

### Checklist
- [ ] Configure environment variables for the AI API key.
- [ ] Add a minimal backend route or service for AI connectivity testing.
- [ ] Validate a simple prompt such as 2 + 2.
- [ ] Confirm the response is returned in the expected format.
- [ ] Add reasonable error handling for API failures or invalid responses.

### Tests
- [ ] Make a direct AI request with a trivial prompt.
- [ ] Verify the result arrives successfully.
- [ ] Verify the system fails gracefully when credentials are missing or the upstream request fails.

### Success criteria
- OpenRouter connectivity is proven with a working model response.
- The system can report failure clearly without crashing the app.

---

## Phase 8: AI board assistance with structured outputs

### Objective
Send the current Kanban JSON and the user question to the AI, then use structured output to respond to the user and optionally update the board.

### Checklist
- [ ] Add the board JSON and conversation context to the AI request.
- [ ] Define a structured output schema for the assistant response.
- [ ] Support both a plain answer and optional board update instructions.
- [ ] Validate the backend correctly interprets the model response.
- [ ] Add tests for both a textual answer and a board mutating answer.

### Tests
- [ ] Ask a planning question and verify a valid response is returned.
- [ ] Ask for a board modification and confirm the backend updates the Kanban state.
- [ ] Ensure malformed model output is rejected or handled safely.

### Success criteria
- The AI can answer the user and optionally modify the board.
- The output schema is reliable enough for safe automation.
- Structured outputs are covered by tests.

---

## Phase 9: AI sidebar experience in the UI

### Objective
Add an elegant chat panel in the frontend enabling the user to ask questions and allow the AI to update the Kanban when appropriate.

### Checklist
- [ ] Add a sidebar widget that is visually consistent with the existing design language.
- [ ] Let the user send a message and display conversation history.
- [ ] Call the backend AI route with the current board state and the latest user question.
- [ ] Render the AI response in the UI.
- [ ] If the AI proposes board changes, apply them to the client state and refresh automatically.
- [ ] Add UI tests covering conversation flow and board refresh behavior.

### Tests
- [ ] Send a message and verify the response appears.
- [ ] Trigger a board-changing AI suggestion and confirm the UI updates.
- [ ] Verify the UI behaves correctly when the backend returns an error.

### Success criteria
- The assistant is accessible from the board and feels integrated into the product.
- AI-driven updates appear in the UI without manual refresh.
- Core chat and update flows are tested.

---

## General engineering rules
- Keep changes small and testable.
- Do not over-engineer or add speculative features.
- Prefer clear, readable code over broad abstraction.
- Validate root cause before implementing a fix.
- Prefer evidence from failing tests or runtime errors before changing code.

## Definition of done for the MVP
The project is complete when all of the following are true:
- The app runs locally via Docker and scripts.
- Users sign in with the required dummy credentials before viewing the board.
- The Kanban board loads and persists data through the backend.
- AI connectivity is active and structured outputs are validated.
- Frontend and backend tests pass for the implemented flows.
- The app supports AI-assisted board updates from a sidebar experience.

## Approval gate
Before moving beyond planning, the project owner should review this document and confirm the scope, milestones, and acceptance criteria above. Implementation should not continue until the plan is explicitly approved.
