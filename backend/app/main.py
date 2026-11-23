from contextlib import asynccontextmanager

from fastapi import FastAPI, Request, Response
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

# Private Network Access (PNA) and CORS preflight handling for web and LAN clients
@app.middleware("http")
async def add_pna_and_cors_headers(request: Request, call_next):
    if request.method == "OPTIONS":
        res = Response()
        res.headers["Access-Control-Allow-Origin"] = "*"
        res.headers["Access-Control-Allow-Methods"] = "*"
        res.headers["Access-Control-Allow-Headers"] = "*"
        res.headers["Access-Control-Allow-Private-Network"] = "true"
        return res
    response = await call_next(request)
    response.headers["Access-Control-Allow-Private-Network"] = "true"
    return response

# Standard CORS Middleware
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
