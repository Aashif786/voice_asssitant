import os
import shutil
import time
from pathlib import Path
from typing import Dict, List, Optional
from backend.app.config import DATA_DIR, MODELS_DIR
from backend.app.models.schemas import ModelCompatibility, ModelInfo, ModelStateResponse
from backend.app.services.database import (
    delete_model_record,
    get_connection,
    get_installed_model_ids,
    register_model_record,
)

GB = 1024 ** 3

CATALOGUE_DATA: List[Dict] = [
    {
        "id": "qwen2.5-1.5b",
        "family": "Qwen",
        "name": "Qwen 2.5 1.5B Instruct",
        "params": "1.5B",
        "sizeBytes": int(1.1 * GB),
        "format": "GGUF",
        "quantization": "Q4_K_M",
        "languages": ["EN", "ZH", "+27"],
        "compatibility": {"level": "likely", "note": "Fits 4 GB RAM devices"},
        "hue": "success"
    },
    {
        "id": "llama3.2-3b",
        "family": "Llama",
        "name": "Llama 3.2 3B Instruct",
        "params": "3B",
        "sizeBytes": int(2.0 * GB),
        "format": "GGUF",
        "quantization": "Q4_K_M",
        "languages": ["EN", "DE", "FR", "HI", "+4"],
        "compatibility": {"level": "likely", "note": "Needs ~4 GB free RAM"},
        "hue": "brand"
    },
    {
        "id": "gemma3-1b",
        "family": "Gemma",
        "name": "Gemma 3 1B IT",
        "params": "1B",
        "sizeBytes": int(0.8 * GB),
        "format": "GGUF",
        "quantization": "Q4_K_M",
        "languages": ["EN"],
        "compatibility": {"level": "likely", "note": "Smallest footprint · fastest replies"},
        "hue": "accent"
    },
    {
        "id": "phi3.5-mini",
        "family": "Phi",
        "name": "Phi-3.5 Mini Instruct",
        "params": "3.8B",
        "sizeBytes": int(2.2 * GB),
        "format": "GGUF",
        "quantization": "Q4_K_M",
        "languages": ["EN", "+20"],
        "compatibility": {"level": "unverified", "note": "High reasoning capacity"},
        "hue": "warning"
    },
    {
        "id": "qwen2.5-7b",
        "family": "Qwen",
        "name": "Qwen 2.5 7B Instruct",
        "params": "7B",
        "sizeBytes": int(4.4 * GB),
        "format": "GGUF",
        "quantization": "Q4_K_M",
        "languages": ["EN", "ZH", "+27"],
        "compatibility": {"level": "unlikely", "note": "Needs ~8 GB RAM; high end devices only"},
        "hue": "error"
    },
]

class ModelManager:
    def __init__(self):
        self.download_progress: Dict[str, float] = {}
        self.selected_model_id: Optional[str] = None
        self._load_selected_model()

    def _load_selected_model(self) -> None:
        try:
            with get_connection() as conn:
                cursor = conn.execute("SELECT value FROM app_settings WHERE key = 'selected_model'")
                row = cursor.fetchone()
                if row:
                    self.selected_model_id = row["value"]
        except Exception:
            self.selected_model_id = None

    def get_catalogue(self) -> List[ModelInfo]:
        installed_ids = set(get_installed_model_ids())
        models = []
        for d in CATALOGUE_DATA:
            is_dl = d["id"] in installed_ids
            file_path = str(MODELS_DIR / f"{d['id']}.gguf") if is_dl else None
            models.append(
                ModelInfo(
                    id=d["id"],
                    family=d["family"],
                    name=d["name"],
                    params=d["params"],
                    sizeBytes=d["sizeBytes"],
                    format=d["format"],
                    quantization=d["quantization"],
                    languages=d["languages"],
                    compatibility=ModelCompatibility(**d["compatibility"]),
                    hue=d["hue"],
                    isDownloaded=is_dl,
                    filePath=file_path
                )
            )
        return models

    def get_state(self) -> ModelStateResponse:
        installed = get_installed_model_ids()
        # If selected model is not in installed, fallback to first or None
        sel = self.selected_model_id if self.selected_model_id in installed else (installed[0] if installed else None)
        return ModelStateResponse(installed=installed, selected=sel)

    def select_model(self, model_id: str) -> None:
        self.selected_model_id = model_id
        with get_connection() as conn:
            conn.execute(
                "INSERT OR REPLACE INTO app_settings (key, value) VALUES ('selected_model', ?)",
                (model_id,)
            )
            conn.commit()

    async def download_model(self, model_id: str) -> bool:
        model_meta = next((m for m in CATALOGUE_DATA if m["id"] == model_id), None)
        if not model_meta:
            raise ValueError(f"Unknown model ID: {model_id}")

        file_path = MODELS_DIR / f"{model_id}.gguf"
        self.download_progress[model_id] = 0.0

        try:
            # Create a valid model weight placeholder descriptor
            with open(file_path, "wb") as f:
                header = f"GGUF-MODEL-DESCRIPTOR:{model_meta['name']}:{model_meta['quantization']}\n".encode("utf-8")
                f.write(header)
                # Simulate smooth download chunks with progress
                for i in range(1, 11):
                    time.sleep(0.08)
                    self.download_progress[model_id] = round(i / 10.0, 2)
                    f.write(b"\x00" * 4096)

            register_model_record(
                model_id=model_id,
                name=model_meta["name"],
                file_path=str(file_path),
                size_bytes=model_meta["sizeBytes"]
            )
            self.download_progress.pop(model_id, None)

            if not self.selected_model_id:
                self.select_model(model_id)

            return True
        except Exception as e:
            self.download_progress.pop(model_id, None)
            if file_path.exists():
                file_path.unlink(missing_ok=True)
            raise e

    def delete_model(self, model_id: str) -> None:
        file_path = MODELS_DIR / f"{model_id}.gguf"
        if file_path.exists():
            file_path.unlink(missing_ok=True)
        delete_model_record(model_id)
        if self.selected_model_id == model_id:
            self.selected_model_id = None
            with get_connection() as conn:
                conn.execute("DELETE FROM app_settings WHERE key = 'selected_model'")
                conn.commit()

    @staticmethod
    def get_available_bytes() -> int:
        try:
            total, used, free = shutil.disk_usage(str(DATA_DIR))
            return free
        except Exception:
            return 20 * (1024 ** 3)  # 20 GB fallback

model_manager = ModelManager()
