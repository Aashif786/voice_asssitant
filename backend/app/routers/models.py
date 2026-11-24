import asyncio
import fnmatch
import ipaddress
import re
import socket
import urllib.parse
from typing import Any, Dict, List, Optional
from fastapi import APIRouter, HTTPException, Query, status
from fastapi.responses import FileResponse, JSONResponse
from backend.app.config import MODELS_DIR
from backend.app.models.schemas import ModelInfo, ModelStateResponse, CustomModelRequest
from backend.app.services.model_service import model_manager

router = APIRouter(prefix="/api/models", tags=["models"])

MODEL_ID_REGEX = re.compile(r"^[a-zA-Z0-9._-]+$")

ALLOWED_DOWNLOAD_HOST_PATTERNS = [
    "huggingface.co",
    "*.huggingface.co",
]


def validate_model_id(model_id: str) -> str:
    if not model_id or not MODEL_ID_REGEX.match(model_id):
        raise HTTPException(
            status_code=400,
            detail=f"Invalid model ID '{model_id}'. Must contain only alphanumeric characters, '.', '_', or '-'."
        )
    return model_id


def validate_download_url(url: str) -> str:
    if not url or not url.strip():
        raise HTTPException(status_code=400, detail="downloadUrl cannot be empty")

    parsed = urllib.parse.urlsplit(url)
    if parsed.scheme.lower() != "https":
        raise HTTPException(
            status_code=400,
            detail=f"Invalid downloadUrl scheme '{parsed.scheme}'. Only https:// URLs are allowed."
        )

    hostname = parsed.hostname
    if not hostname:
        raise HTTPException(status_code=400, detail="Invalid downloadUrl: missing hostname.")
    hostname = hostname.lower()

    allowed = any(
        hostname == pattern or fnmatch.fnmatch(hostname, pattern)
        for pattern in ALLOWED_DOWNLOAD_HOST_PATTERNS
    )
    if not allowed:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid downloadUrl host '{hostname}'. Host must be on an allowlisted domain (e.g. huggingface.co, cdn-lfs*.huggingface.co)."
        )

    # Block private, loopback, link-local, and reserved IP ranges to prevent SSRF
    try:
        addr_info = socket.getaddrinfo(hostname, None)
        for _, _, _, _, sockaddr in addr_info:
            ip_str = sockaddr[0]
            ip = ipaddress.ip_address(ip_str)
            if ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved or ip.is_multicast or ip.is_unspecified:
                raise HTTPException(
                    status_code=400,
                    detail=f"Invalid downloadUrl: resolved IP '{ip_str}' is in a private/restricted address range."
                )
    except socket.gaierror:
        # In offline testing or DNS failure, allow allowlisted hostnames through
        pass

    return url


@router.get("/catalogue", response_model=List[ModelInfo])
async def get_catalogue(
    provider: str = Query("all", description="Filter by provider: all, Hugging Face, DeepSeek, Meta, Alibaba, Google, Microsoft, System Native"),
    type: str = Query("all", description="Filter by type: all, llm, stt"),
    query: Optional[str] = Query(None, description="Search query")
):
    return model_manager.get_catalogue(provider=provider, model_type=type, query=query)


@router.get("/discover", response_model=List[ModelInfo])
async def discover_models(
    query: str = Query("gguf", description="Hugging Face search query"),
    type: str = Query("all", description="Model type: all, llm, stt"),
    limit: int = Query(20, description="Max results to fetch")
):
    """
    Dynamically fetches models from Hugging Face Hub on the fly.
    Allows discovering any frontier model without a fixed catalogue limit.
    """
    items = await model_manager.fetch_dynamic_hf(query=query, model_type=type, limit=limit)
    return items


@router.post("/custom", response_model=ModelInfo)
async def add_custom_model(req: CustomModelRequest):
    """
    Registers a custom dynamic model with a direct download URL.
    """
    validate_model_id(req.id)
    validate_download_url(req.downloadUrl)

    data = req.model_dump()
    data["compatibility"] = {"level": "likely", "note": f"Custom user registered model ({req.provider})"}
    data["hue"] = "accent"

    try:
        model_info = model_manager.add_custom_model(data)
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to register custom model: {str(e)}")

    if not model_info:
        raise HTTPException(status_code=500, detail="Failed to register custom model")
    return model_info


@router.get("/state", response_model=ModelStateResponse)
async def get_model_state():
    return model_manager.get_state()


@router.get("/progress/{model_id}")
async def get_model_progress(model_id: str):
    validate_model_id(model_id)
    return model_manager.get_progress(model_id)


_active_downloads: Dict[str, asyncio.Task] = {}


@router.post("/download/{model_id}", status_code=status.HTTP_202_ACCEPTED)
async def download_model(model_id: str):
    validate_model_id(model_id)

    meta = model_manager.find_in_baseline(model_id)
    if not meta:
        raise HTTPException(status_code=404, detail=f"Unknown model ID: {model_id}")

    if not meta.get("downloadUrl"):
        raise HTTPException(status_code=400, detail=f"No download URL configured for model {model_id}")

    existing_task = _active_downloads.get(model_id)
    if existing_task and not existing_task.done():
        return JSONResponse(
            status_code=status.HTTP_202_ACCEPTED,
            content={
                "status": "accepted",
                "message": f"Download of {model_id} already in progress."
            }
        )

    task = asyncio.create_task(model_manager.download_model(model_id))
    _active_downloads[model_id] = task

    def _cleanup_task(t: asyncio.Task):
        if _active_downloads.get(model_id) is t:
            _active_downloads.pop(model_id, None)

    task.add_done_callback(_cleanup_task)

    return JSONResponse(
        status_code=status.HTTP_202_ACCEPTED,
        content={
            "status": "accepted",
            "message": f"Download of {model_id} scheduled in background."
        }
    )


@router.post("/select/{model_id}")
async def select_model(model_id: str):
    validate_model_id(model_id)
    try:
        await model_manager.select_model(model_id)
        return {"status": "success", "selected": model_id}
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Select failed: {str(e)}")


@router.delete("/{model_id}")
async def delete_model(model_id: str):
    validate_model_id(model_id)
    try:
        model_manager.delete_model(model_id)
        return {"status": "success", "message": f"Model {model_id} removed from device."}
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Delete failed: {str(e)}")


@router.get("/storage")
async def get_storage_info():
    free_bytes = model_manager.get_available_bytes()
    catalogue = model_manager.get_catalogue()
    installed_bytes = sum(m.sizeBytes for m in catalogue if m.isDownloaded)
    return {
        "availableBytes": free_bytes,
        "usedBytes": installed_bytes,
    }


@router.get("/file/{model_id}")
async def get_model_file(model_id: str):
    """
    Securely streams a downloaded model file (.gguf or .bin) to mobile clients
    over local network or ADB reverse tunnel for high-speed offline transfer.
    """
    validate_model_id(model_id)
    models_root = MODELS_DIR.resolve()
    for ext in [".gguf", ".bin"]:
        candidate = (models_root / f"{model_id}{ext}").resolve()
        if candidate.is_relative_to(models_root) and candidate.exists() and candidate.is_file():
            return FileResponse(
                path=candidate,
                media_type="application/octet-stream",
                filename=f"{model_id}{ext}"
            )
    raise HTTPException(status_code=404, detail=f"Model file '{model_id}' not found on backend server.")

