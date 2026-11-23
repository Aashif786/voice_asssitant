from typing import Any, Dict, List, Optional
from fastapi import APIRouter, HTTPException, Query
from backend.app.models.schemas import ModelInfo, ModelStateResponse, CustomModelRequest
from backend.app.services.model_service import model_manager

router = APIRouter(prefix="/api/models", tags=["models"])

@router.get("/catalogue", response_model=List[ModelInfo])
async def get_catalogue(
    provider: str = Query("all", description="Filter by provider: all, Hugging Face, DeepSeek, Meta, Alibaba, Google, Microsoft, System Native"),
    type: str = Query("all", description="Filter by type: all, llm, stt"),
    query: Optional[str] = Query(None, description="Search query")
):
    return model_manager.get_catalogue(provider=provider, model_type=type, query=query)

@router.get("/discover", response_model=List[Dict[str, Any]] if False else List[ModelInfo])
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
    try:
        data = req.model_dump()
        data["compatibility"] = {"level": "likely", "note": f"Custom user registered model ({req.provider})"}
        data["hue"] = "accent"
        model_info = model_manager.add_custom_model(data)
        if not model_info:
            raise HTTPException(status_code=500, detail="Failed to register custom model")
        return model_info
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.get("/state", response_model=ModelStateResponse)
async def get_model_state():
    return model_manager.get_state()

@router.get("/progress/{model_id}")
async def get_model_progress(model_id: str):
    return model_manager.get_progress(model_id)

@router.post("/download/{model_id}")
async def download_model(model_id: str):
    try:
        await model_manager.download_model(model_id)
        return {"status": "success", "message": f"Model {model_id} downloaded and installed successfully."}
    except ValueError as ve:
        raise HTTPException(status_code=404, detail=str(ve))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Download failed: {str(e)}")

@router.post("/select/{model_id}")
async def select_model(model_id: str):
    model_manager.select_model(model_id)
    return {"status": "success", "selected": model_id}

@router.delete("/{model_id}")
async def delete_model(model_id: str):
    try:
        model_manager.delete_model(model_id)
        return {"status": "success", "message": f"Model {model_id} removed from device."}
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
