import os
import platform
import shutil
import sys
from fastapi import APIRouter
import psutil
from backend.app.config import DATA_DIR
from backend.app.models.schemas import SystemDiagnosticsResponse
from backend.app.services.database import get_installed_model_ids
from backend.app.services.model_service import model_manager

router = APIRouter(prefix="/api/diagnostics", tags=["diagnostics"])

@router.get("/system", response_model=SystemDiagnosticsResponse)
async def get_system_diagnostics():
    mem = psutil.virtual_memory()
    total_mem_gb = round(mem.total / (1024 ** 3), 2)
    avail_mem_gb = round(mem.available / (1024 ** 3), 2)

    total_storage, used_storage, free_storage = shutil.disk_usage(str(DATA_DIR))
    free_storage_gb = round(free_storage / (1024 ** 3), 2)
    total_storage_gb = round(total_storage / (1024 ** 3), 2)

    installed_ids = get_installed_model_ids()

    return SystemDiagnosticsResponse(
        platform=f"{platform.system()} {platform.release()} ({platform.machine()})",
        cpuCount=os.cpu_count() or 1,
        memoryTotalGB=total_mem_gb,
        memoryAvailableGB=avail_mem_gb,
        storageFreeGB=free_storage_gb,
        storageTotalGB=total_storage_gb,
        whisperAvailable=True,
        pythonVersion=sys.version.split()[0],
        activeModel=model_manager.selected_model_id,
        installedModelsCount=len(installed_ids)
    )
