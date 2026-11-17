from typing import List
from fastapi import APIRouter, HTTPException
from backend.app.models.schemas import ModelInfo, ModelStateResponse
from backend.app.services.model_service import model_manager

router = APIRouter(prefix="/api/models", tags=["models"])

@router.get("/catalogue", response_model=List[ModelInfo])
async def get_catalogue():
    return model_manager.get_catalogue()

@router.get("/state", response_model=ModelStateResponse)
async def get_model_state():
    return model_manager.get_state()

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
