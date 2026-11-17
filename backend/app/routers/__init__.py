from .chat import router as chat_router
from .voice import router as voice_router
from .models import router as models_router
from .tools import router as tools_router
from .diagnostics import router as diagnostics_router

__all__ = [
    "chat_router",
    "voice_router",
    "models_router",
    "tools_router",
    "diagnostics_router",
]
