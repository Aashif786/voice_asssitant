import os
from pathlib import Path


def _env_dir(var: str, default: Path) -> Path:
    """Resolve a directory from an env var (if set), else the default, and ensure it exists."""
    raw = os.getenv(var)
    path = Path(raw).expanduser().resolve() if raw else default
    path.mkdir(parents=True, exist_ok=True)
    return path


BASE_DIR = Path(__file__).resolve().parent.parent

# All runtime data locations are overridable via env so the server can run with a
# writable data directory in any environment (containers, CI, read-only installs).
DATA_DIR = _env_dir("VA_DATA_DIR", BASE_DIR / "data")
MODELS_DIR = _env_dir("VA_MODELS_DIR", DATA_DIR / "models")

_db_env = os.getenv("VA_DB_PATH")
DB_PATH = Path(_db_env).expanduser().resolve() if _db_env else (DATA_DIR / "assistant.db")

HOST = os.getenv("HOST", "0.0.0.0")
PORT = int(os.getenv("PORT", "8000"))

# Optional cloud fallbacks. Empty => disabled (app stays fully offline/on-device).
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")

# Comma-separated allowlist. Default "*" is fine because the API uses no cookies/
# credentials; see main.py where allow_credentials is therefore False.
CORS_ORIGINS = [o.strip() for o in os.getenv("VA_CORS_ORIGINS", "*").split(",") if o.strip()]

# Dev-only auto-reload; off by default so the production entrypoint doesn't run the reloader.
RELOAD = os.getenv("VA_RELOAD", "false").lower() in ("1", "true", "yes", "on")
