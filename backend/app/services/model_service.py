import asyncio
import os
import shutil
import time
from pathlib import Path
from typing import Any, Dict, List, Optional
import httpx

from backend.app.config import DATA_DIR, MODELS_DIR
from backend.app.models.schemas import ModelCompatibility, ModelInfo, ModelStateResponse
from backend.app.services.database import (
    delete_model_record,
    get_connection,
    get_installed_model_ids,
    register_model_record,
)
from backend.app.services.local_llm import local_llm

GB = 1024 ** 3
MB = 1024 ** 2

CATALOGUE_DATA: List[Dict[str, Any]] = [
    {
        "id": "smollm2-135m",
        "family": "SmolLM",
        "name": "SmolLM2 135M Instruct",
        "params": "135M",
        "sizeBytes": 105487360,  # ~100.6 MB
        "format": "GGUF",
        "quantization": "Q4_K_M",
        "languages": ["EN"],
        "compatibility": {"level": "likely", "note": "Smallest footprint · Instant offline responses"},
        "hue": "accent",
        "downloadUrl": "https://huggingface.co/prithivMLmods/SmolLM2-135M-Instruct-GGUF/resolve/main/SmolLM2-135M-Instruct.Q4_K_M.gguf"
    },
    {
        "id": "qwen2.5-0.5b",
        "family": "Qwen",
        "name": "Qwen 2.5 0.5B Instruct",
        "params": "0.5B",
        "sizeBytes": 491384832,  # ~468 MB
        "format": "GGUF",
        "quantization": "Q4_K_M",
        "languages": ["EN", "ZH", "+27"],
        "compatibility": {"level": "likely", "note": "High precision · Fits 2 GB RAM"},
        "hue": "success",
        "downloadUrl": "https://huggingface.co/Qwen/Qwen2.5-0.5B-Instruct-GGUF/resolve/main/qwen2.5-0.5b-instruct-q4_k_m.gguf"
    },
    {
        "id": "tinyllama-1.1b",
        "family": "TinyLlama",
        "name": "TinyLlama 1.1B Chat",
        "params": "1.1B",
        "sizeBytes": 668782592,  # ~638 MB
        "format": "GGUF",
        "quantization": "Q4_K_M",
        "languages": ["EN"],
        "compatibility": {"level": "likely", "note": "Fast chat engine · Fits 3 GB RAM"},
        "hue": "brand",
        "downloadUrl": "https://huggingface.co/TheBloke/TinyLlama-1.1B-Chat-v1.0-GGUF/resolve/main/tinyllama-1.1b-chat-v1.0.Q4_K_M.gguf"
    },
    {
        "id": "qwen2.5-1.5b",
        "family": "Qwen",
        "name": "Qwen 2.5 1.5B Instruct",
        "params": "1.5B",
        "sizeBytes": 1117392896,  # ~1.06 GB
        "format": "GGUF",
        "quantization": "Q4_K_M",
        "languages": ["EN", "ZH", "+27"],
        "compatibility": {"level": "likely", "note": "Balanced reasoning · Fits 4 GB RAM"},
        "hue": "success",
        "downloadUrl": "https://huggingface.co/Qwen/Qwen2.5-1.5B-Instruct-GGUF/resolve/main/qwen2.5-1.5b-instruct-q4_k_m.gguf"
    },
    {
        "id": "llama3.2-1b",
        "family": "Llama",
        "name": "Llama 3.2 1B Instruct",
        "params": "1B",
        "sizeBytes": 807759872,  # ~770 MB
        "format": "GGUF",
        "quantization": "Q4_K_M",
        "languages": ["EN", "DE", "FR", "HI", "+4"],
        "compatibility": {"level": "likely", "note": "Meta's lightweight model · Fast replies"},
        "hue": "brand",
        "downloadUrl": "https://huggingface.co/bartowski/Llama-3.2-1B-Instruct-GGUF/resolve/main/Llama-3.2-1B-Instruct-Q4_K_M.gguf"
    },
    {
        "id": "llama3.2-3b",
        "family": "Llama",
        "name": "Llama 3.2 3B Instruct",
        "params": "3B",
        "sizeBytes": 2019448832,  # ~1.92 GB
        "format": "GGUF",
        "quantization": "Q4_K_M",
        "languages": ["EN", "DE", "FR", "HI", "+4"],
        "compatibility": {"level": "likely", "note": "Needs ~4 GB free RAM · Deep reasoning"},
        "hue": "brand",
        "downloadUrl": "https://huggingface.co/bartowski/Llama-3.2-3B-Instruct-GGUF/resolve/main/Llama-3.2-3B-Instruct-Q4_K_M.gguf"
    },
    {
        "id": "phi3.5-mini",
        "family": "Phi",
        "name": "Phi-3.5 Mini Instruct",
        "params": "3.8B",
        "sizeBytes": 2393231360,  # ~2.28 GB
        "format": "GGUF",
        "quantization": "Q4_K_M",
        "languages": ["EN", "+20"],
        "compatibility": {"level": "unverified", "note": "High reasoning capacity · Needs 4-6 GB RAM"},
        "hue": "warning",
        "downloadUrl": "https://huggingface.co/bartowski/Phi-3.5-mini-instruct-GGUF/resolve/main/Phi-3.5-mini-instruct-Q4_K_M.gguf"
    },
    {
        "id": "qwen2.5-7b",
        "family": "Qwen",
        "name": "Qwen 2.5 7B Instruct",
        "params": "7B",
        "sizeBytes": 4683074240,  # ~4.68 GB
        "format": "GGUF",
        "quantization": "Q4_K_M",
        "languages": ["EN", "ZH", "+27"],
        "compatibility": {"level": "unlikely", "note": "Needs ~8 GB RAM; high end devices only"},
        "hue": "error",
        "downloadUrl": "https://huggingface.co/bartowski/Qwen2.5-7B-Instruct-GGUF/resolve/main/Qwen2.5-7B-Instruct-Q4_K_M.gguf"
    },
    # Backwards compatibility alias for older UI references
    {
        "id": "gemma3-1b",
        "family": "Gemma",
        "name": "Gemma 3 1B IT",
        "params": "1B",
        "sizeBytes": 105487360,
        "format": "GGUF",
        "quantization": "Q4_K_M",
        "languages": ["EN"],
        "compatibility": {"level": "likely", "note": "Smallest footprint · fastest replies"},
        "hue": "accent",
        "downloadUrl": "https://huggingface.co/prithivMLmods/SmolLM2-135M-Instruct-GGUF/resolve/main/SmolLM2-135M-Instruct.Q4_K_M.gguf"
    }
]

class ModelManager:
    def __init__(self):
        self.download_state: Dict[str, Dict[str, Any]] = {}
        self.selected_model_id: Optional[str] = None
        self._sync_disk_models()
        self._load_selected_model()

    def _sync_disk_models(self) -> None:
        """
        Scans MODELS_DIR for existing .gguf files and registers them.
        """
        try:
            MODELS_DIR.mkdir(parents=True, exist_ok=True)
            for f in MODELS_DIR.glob("*.gguf"):
                if f.is_file() and f.stat().st_size > 1024:
                    model_id = f.stem
                    meta = next((m for m in CATALOGUE_DATA if m["id"] == model_id), None)
                    name = meta["name"] if meta else model_id.title()
                    register_model_record(
                        model_id=model_id,
                        name=name,
                        file_path=str(f),
                        size_bytes=f.stat().st_size
                    )
        except Exception:
            pass

    def _load_selected_model(self) -> None:
        try:
            with get_connection() as conn:
                cursor = conn.execute("SELECT value FROM app_settings WHERE key = 'selected_model'")
                row = cursor.fetchone()
                if row and row["value"]:
                    self.selected_model_id = row["value"]
                else:
                    installed = get_installed_model_ids()
                    if installed:
                        self.selected_model_id = installed[0]
                        conn.execute("INSERT OR REPLACE INTO app_settings (key, value) VALUES ('selected_model', ?)", (installed[0],))
                        conn.commit()
        except Exception:
            self.selected_model_id = None

    def get_catalogue(self) -> List[ModelInfo]:
        installed_ids = set(get_installed_model_ids())
        models = []
        for d in CATALOGUE_DATA:
            # Skip hidden alias in public catalogue listing if desired or display cleanly
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

        # Switch local inference server to this model if it's installed
        model_file = MODELS_DIR / f"{model_id}.gguf"
        if model_file.exists():
            local_llm.ensure_server(model_id, model_file)

    def get_progress(self, model_id: str) -> Dict[str, Any]:
        if model_id in self.download_state:
            return self.download_state[model_id]
        
        # Check if already installed
        if model_id in get_installed_model_ids():
            return {"progress": 1.0, "status": "installed", "downloadedBytes": 0, "totalBytes": 0}
            
        return {"progress": 0.0, "status": "idle", "downloadedBytes": 0, "totalBytes": 0}

    async def download_model(self, model_id: str) -> bool:
        model_meta = next((m for m in CATALOGUE_DATA if m["id"] == model_id), None)
        if not model_meta:
            raise ValueError(f"Unknown model ID: {model_id}")

        url = model_meta.get("downloadUrl")
        if not url:
            raise ValueError(f"No download URL configured for model {model_id}")

        file_path = MODELS_DIR / f"{model_id}.gguf"
        tmp_path = MODELS_DIR / f"{model_id}.gguf.tmp"

        self.download_state[model_id] = {
            "progress": 0.01,
            "downloadedBytes": 0,
            "totalBytes": model_meta["sizeBytes"],
            "status": "downloading",
            "error": None
        }

        try:
            timeout = httpx.Timeout(connect=15.0, read=300.0, write=60.0, pool=15.0)
            headers = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) VoiceAssistant/1.0"}

            async with httpx.AsyncClient(follow_redirects=True, timeout=timeout) as client:
                async with client.stream("GET", url, headers=headers) as response:
                    if response.status_code != 200:
                        raise RuntimeError(f"Hugging Face returned status {response.status_code}")

                    total = int(response.headers.get("content-length", 0)) or model_meta["sizeBytes"]
                    self.download_state[model_id]["totalBytes"] = total

                    downloaded = 0
                    last_update_time = time.time()

                    with open(tmp_path, "wb") as f:
                        async for chunk in response.aiter_bytes(chunk_size=128 * 1024):
                            if not chunk:
                                continue
                            f.write(chunk)
                            downloaded += len(chunk)

                            now = time.time()
                            if now - last_update_time >= 0.2:
                                p = min(0.99, downloaded / total) if total > 0 else 0.5
                                self.download_state[model_id]["progress"] = round(p, 3)
                                self.download_state[model_id]["downloadedBytes"] = downloaded
                                last_update_time = now

            # Atomic rename on complete
            if tmp_path.exists():
                if file_path.exists():
                    file_path.unlink()
                tmp_path.rename(file_path)

            actual_size = file_path.stat().st_size
            register_model_record(
                model_id=model_id,
                name=model_meta["name"],
                file_path=str(file_path),
                size_bytes=actual_size
            )

            self.download_state[model_id] = {
                "progress": 1.0,
                "downloadedBytes": actual_size,
                "totalBytes": actual_size,
                "status": "completed",
                "error": None
            }

            if not self.selected_model_id or self.selected_model_id not in get_installed_model_ids():
                self.select_model(model_id)

            return True

        except Exception as e:
            if tmp_path.exists():
                tmp_path.unlink(missing_ok=True)
            self.download_state[model_id] = {
                "progress": 0.0,
                "downloadedBytes": 0,
                "totalBytes": model_meta["sizeBytes"],
                "status": "error",
                "error": str(e)
            }
            raise e

    def delete_model(self, model_id: str) -> None:
        file_path = MODELS_DIR / f"{model_id}.gguf"
        tmp_path = MODELS_DIR / f"{model_id}.gguf.tmp"

        if file_path.exists():
            file_path.unlink(missing_ok=True)
        if tmp_path.exists():
            tmp_path.unlink(missing_ok=True)

        delete_model_record(model_id)
        self.download_state.pop(model_id, None)

        if self.selected_model_id == model_id:
            local_llm.stop_server()
            installed = get_installed_model_ids()
            new_sel = installed[0] if installed else None
            self.selected_model_id = new_sel
            with get_connection() as conn:
                if new_sel:
                    conn.execute("INSERT OR REPLACE INTO app_settings (key, value) VALUES ('selected_model', ?)", (new_sel,))
                else:
                    conn.execute("DELETE FROM app_settings WHERE key = 'selected_model'")
                conn.commit()

    @staticmethod
    def get_available_bytes() -> int:
        try:
            total, used, free = shutil.disk_usage(str(DATA_DIR))
            return free
        except Exception:
            return 20 * (1024 ** 3)

model_manager = ModelManager()
