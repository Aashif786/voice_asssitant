import secrets
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.datastructures import Headers

from backend.app.config import API_KEY, CORS_ORIGINS
from backend.app.routers import (
    chat_router,
    diagnostics_router,
    models_router,
    tools_router,
    voice_router,
)
from backend.app.services.database import init_db
from backend.app.services.local_llm import local_llm


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    yield
    try:
        local_llm.stop_server()
    except Exception:
        pass
    try:
        await local_llm.client.aclose()
    except Exception:
        pass


app = FastAPI(
    title="Offline Voice AI Assistant Backend",
    version="1.0.0",
    description="Optional companion backend for conversational intelligence, voice processing, model management, and offline tool execution.",
    lifespan=lifespan,
)

def _is_origin_allowed(origin: str | None) -> bool:
    if not origin:
        return False
    if "*" in CORS_ORIGINS:
        return True
    return origin in CORS_ORIGINS


class SafeCORSMiddleware(CORSMiddleware):
    """Enforces CORS policies and ensures PNA headers are only appended when origin is allowed."""

    def preflight_response(self, request_headers: Headers) -> Response:
        res = super().preflight_response(request_headers)
        origin = request_headers.get("origin")
        if not self.is_allowed_origin(origin or ""):
            if "access-control-allow-private-network" in res.headers:
                del res.headers["access-control-allow-private-network"]
        return res


# Private Network Access (PNA) header handling for allowed origins
@app.middleware("http")
async def handle_pna_headers(request: Request, call_next):
    origin = request.headers.get("origin")
    response = await call_next(request)
    if _is_origin_allowed(origin):
        response.headers["Access-Control-Allow-Private-Network"] = "true"
    else:
        if "access-control-allow-private-network" in response.headers:
            del response.headers["access-control-allow-private-network"]
    return response


# Optional Bearer / API Key authentication middleware
@app.middleware("http")
async def api_key_auth_middleware(request: Request, call_next):
    # When VA_API_KEY is not set or empty, auth is disabled
    if not API_KEY:
        return await call_next(request)

    # Health checks and OPTIONS preflight requests remain unauthenticated
    if request.method == "OPTIONS" or request.url.path in ("/", "/api/health"):
        return await call_next(request)

    # Check Authorization: Bearer <key> or X-API-Key: <key>
    auth_header = request.headers.get("authorization", "")
    api_key_header = request.headers.get("x-api-key", "")

    provided_key = None
    if auth_header.startswith("Bearer "):
        provided_key = auth_header[7:].strip()
    elif api_key_header:
        provided_key = api_key_header.strip()

    if not provided_key or not secrets.compare_digest(provided_key, API_KEY):
        return JSONResponse(
            status_code=401,
            content={"detail": "Unauthorized: Invalid or missing API key."},
            headers={"WWW-Authenticate": "Bearer"},
        )

    return await call_next(request)


# Standard CORS Middleware (enforces VA_CORS_ORIGINS and handles preflights)
app.add_middleware(
    SafeCORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
    allow_private_network=True,
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
