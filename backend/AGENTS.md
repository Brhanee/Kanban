# Backend guide

The FastAPI service serves the built Next.js frontend and provides the API for the Kanban MVP.

## Structure
- `app/main.py` creates the FastAPI application, initializes the database on startup, and configures static frontend serving.
- `app/database.py` owns SQLite schema creation, demo-user/board seeding, password hashing, and database connections.
- `app/api.py` contains login/logout and authenticated board, card, and column routes.
- `tests/` contains FastAPI tests using temporary SQLite databases.

## Data and authentication
- The SQLite database defaults to `backend/data/pm.sqlite3`.
- Enable SQLite foreign keys on every connection and use transactions for writes that change card positions.
- The MVP login is `user` / `password`; only a PBKDF2 password hash is stored.
- API board routes require the bearer token returned by `/api/auth/login`. Tokens are held in memory and are cleared when the service restarts.
- Keep the `/api` routes registered before the static frontend fallback so API requests cannot be served as HTML.

## Validation
Run backend tests from `backend/` with `uv run --group dev pytest -q`.