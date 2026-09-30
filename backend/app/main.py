from pathlib import Path
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from app.api import router as api_router
from app.database import DEFAULT_DATABASE_PATH, initialize_database

PROJECT_ROOT = Path(__file__).resolve().parents[2]
STATIC_DIR = Path(__file__).resolve().parent / "static"
FRONTEND_BUILD_DIR = PROJECT_ROOT / "frontend" / "out"
INDEX_FILE = STATIC_DIR / "index.html"


def create_app(database_path: Path | None = None) -> FastAPI:
    configured_database_path = database_path or DEFAULT_DATABASE_PATH

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        initialize_database(configured_database_path)
        app.state.database_path = configured_database_path
        app.state.sessions = {}
        yield
        app.state.sessions.clear()

    app = FastAPI(title="PM MVP API", lifespan=lifespan)
    app.include_router(api_router)

    @app.get("/api/hello")
    def hello() -> dict[str, str]:
        return {"message": "Hello from FastAPI"}

    @app.get("/health")
    def health() -> dict[str, str]:
        return {"status": "ok"}

    @app.get("/")
    def read_root() -> FileResponse:
        built_index = FRONTEND_BUILD_DIR / "index.html"
        if built_index.exists():
            return FileResponse(built_index)
        return FileResponse(INDEX_FILE)

    if FRONTEND_BUILD_DIR.exists():
        app.mount(
            "/_next",
            StaticFiles(directory=str(FRONTEND_BUILD_DIR / "_next")),
            name="next_static",
        )

        @app.get("/{path:path}")
        def serve_frontend_fallback(path: str) -> FileResponse:
            candidate = FRONTEND_BUILD_DIR / path
            if candidate.is_file():
                return FileResponse(candidate)
            return FileResponse(FRONTEND_BUILD_DIR / "index.html")

    return app


app = create_app()
