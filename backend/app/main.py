from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend.app.config import CORS_ORIGINS
from backend.app.routers import (
    chat_router,
    diagnostics_router,
    models_router,
    tools_router,
    voice_router,
)
from backend.app.services.database import init_db


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    yield


app = FastAPI(
    title="Offline Voice AI Assistant Backend",
    version="1.0.0",
    description="Optional companion backend for conversational intelligence, voice processing, model management, and offline tool execution.",
    lifespan=lifespan,
)

# allow_credentials must be False while origins can be "*": the API uses no cookies or
# auth credentials, and the wildcard + credentials combination is rejected by browsers.
app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(chat_router)
app.include_router(voice_router)
app.include_router(models_router)
app.include_router(tools_router)
app.include_router(diagnostics_router)


@app.get("/")
@app.get("/api/health")
async def health_check():
    return {
        "status": "online",
        "service": "Offline Voice AI Assistant",
        "version": "1.0.0",
        "pipeline": {"chat": "active", "voice": "active", "tools": "active", "models": "active"},
    }


if __name__ == "__main__":
    import uvicorn

    from backend.app.config import HOST, PORT, RELOAD

    uvicorn.run("backend.app.main:app", host=HOST, port=PORT, reload=RELOAD)
