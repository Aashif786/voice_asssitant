import asyncio
import os
import re
import shutil
import time
from pathlib import Path
from typing import Any, Dict, List, Optional
import httpx

from backend.app.config import DATA_DIR, MODELS_DIR
from backend.app.models.schemas import ModelCompatibility, ModelInfo, ModelStateResponse
from backend.app.services.database import (
    delete_custom_model_record,
    delete_model_record,
    get_connection,
    get_installed_model_ids,
    load_custom_models_records,
    register_model_record,
    save_custom_model_record,
)
from backend.app.services.local_llm import local_llm

MODEL_ID_REGEX = re.compile(r"^[a-zA-Z0-9._-]+$")


def validate_model_id(model_id: str) -> str:
    if not model_id or not MODEL_ID_REGEX.match(model_id):
        raise ValueError(f"Invalid model ID '{model_id}'. Must match pattern ^[a-zA-Z0-9._-]+$")
    return model_id

GB = 1024 ** 3
MB = 1024 ** 2

# Frontier Curated Baseline Models (LLMs + STTs)
FRONTIER_BASELINE: List[Dict[str, Any]] = [
    # ======================== Frontier LLM Models ========================
    {
        "id": "deepseek-r1-distill-qwen-1.5b",
        "type": "llm",
        "provider": "DeepSeek",
        "family": "DeepSeek",
        "name": "DeepSeek R1 Distill Qwen 1.5B",
        "params": "1.5B",
        "sizeBytes": 1117392896,
        "format": "GGUF",
        "quantization": "Q4_K_M",
        "languages": ["EN", "ZH", "+20"],
        "execution": "local",
        "requiresDownload": True,
        "compatibility": {"level": "likely", "note": "Frontier reasoning model · Fits 3 GB RAM"},
        "hue": "accent",
        "downloadUrl": "https://huggingface.co/bartowski/DeepSeek-R1-Distill-Qwen-1.5B-GGUF/resolve/main/DeepSeek-R1-Distill-Qwen-1.5B-Q4_K_M.gguf"
    },
    {
        "id": "deepseek-r1-distill-qwen-7b",
        "type": "llm",
        "provider": "DeepSeek",
        "family": "DeepSeek",
        "name": "DeepSeek R1 Distill Qwen 7B",
        "params": "7B",
        "sizeBytes": 4683074240,
        "format": "GGUF",
        "quantization": "Q4_K_M",
        "languages": ["EN", "ZH", "+20"],
        "execution": "local",
        "requiresDownload": True,
        "compatibility": {"level": "unverified", "note": "High-end reasoning powerhouse · Needs 6-8 GB RAM"},
        "hue": "warning",
        "downloadUrl": "https://huggingface.co/bartowski/DeepSeek-R1-Distill-Qwen-7B-GGUF/resolve/main/DeepSeek-R1-Distill-Qwen-7B-Q4_K_M.gguf"
    },
    {
        "id": "smollm2-135m",
        "type": "llm",
        "provider": "Hugging Face",
        "family": "SmolLM",
        "name": "SmolLM2 135M Instruct",
        "params": "135M",
        "sizeBytes": 105487360,
        "format": "GGUF",
        "quantization": "Q4_K_M",
        "languages": ["EN"],
        "execution": "local",
        "requiresDownload": True,
        "compatibility": {"level": "likely", "note": "Smallest footprint · Instant offline responses"},
        "hue": "accent",
        "downloadUrl": "https://huggingface.co/prithivMLmods/SmolLM2-135M-Instruct-GGUF/resolve/main/SmolLM2-135M-Instruct.Q4_K_M.gguf"
    },
    {
        "id": "qwen2.5-0.5b",
        "type": "llm",
        "provider": "Alibaba",
        "family": "Qwen",
        "name": "Qwen 2.5 0.5B Instruct",
        "params": "0.5B",
        "sizeBytes": 491384832,
        "format": "GGUF",
        "quantization": "Q4_K_M",
        "languages": ["EN", "ZH", "+27"],
        "execution": "local",
        "requiresDownload": True,
        "compatibility": {"level": "likely", "note": "High precision · Fits 2 GB RAM"},
        "hue": "success",
        "downloadUrl": "https://huggingface.co/Qwen/Qwen2.5-0.5B-Instruct-GGUF/resolve/main/qwen2.5-0.5b-instruct-q4_k_m.gguf"
    },
    {
        "id": "qwen2.5-1.5b",
        "type": "llm",
        "provider": "Alibaba",
        "family": "Qwen",
        "name": "Qwen 2.5 1.5B Instruct",
        "params": "1.5B",
        "sizeBytes": 1117392896,
        "format": "GGUF",
        "quantization": "Q4_K_M",
        "languages": ["EN", "ZH", "+27"],
        "execution": "local",
        "requiresDownload": True,
        "compatibility": {"level": "likely", "note": "Balanced reasoning · Fits 4 GB RAM"},
        "hue": "success",
        "downloadUrl": "https://huggingface.co/Qwen/Qwen2.5-1.5B-Instruct-GGUF/resolve/main/qwen2.5-1.5b-instruct-q4_k_m.gguf"
    },
    {
        "id": "tinyllama-1.1b",
        "type": "llm",
        "provider": "TheBloke",
        "family": "TinyLlama",
        "name": "TinyLlama 1.1B Chat",
        "params": "1.1B",
        "sizeBytes": 668782592,
        "format": "GGUF",
        "quantization": "Q4_K_M",
        "languages": ["EN"],
        "execution": "local",
        "requiresDownload": True,
        "compatibility": {"level": "likely", "note": "Fast chat engine · Fits 3 GB RAM"},
        "hue": "brand",
        "downloadUrl": "https://huggingface.co/TheBloke/TinyLlama-1.1B-Chat-v1.0-GGUF/resolve/main/tinyllama-1.1b-chat-v1.0.Q4_K_M.gguf"
    },
    {
        "id": "gemma3-1b",
        "type": "llm",
        "provider": "Google",
        "family": "Gemma",
        "name": "Gemma 3 1B IT",
        "params": "1B",
        "sizeBytes": 800000000,
        "format": "GGUF",
        "quantization": "Q4_K_M",
        "languages": ["EN"],
        "execution": "local",
        "requiresDownload": True,
        "compatibility": {"level": "likely", "note": "High-speed Google Gemma reasoning · Fits 2-3 GB RAM"},
        "hue": "accent",
        "downloadUrl": "https://huggingface.co/bartowski/google_gemma-3-1b-it-GGUF/resolve/main/google_gemma-3-1b-it-Q4_K_M.gguf"
    },
    {
        "id": "qwen2.5-coder-1.5b",
        "type": "llm",
        "provider": "Alibaba",
        "family": "Qwen",
        "name": "Qwen 2.5 Coder 1.5B",
        "params": "1.5B",
        "sizeBytes": 1117392896,
        "format": "GGUF",
        "quantization": "Q4_K_M",
        "languages": ["EN", "Code"],
        "execution": "local",
        "requiresDownload": True,
        "compatibility": {"level": "likely", "note": "Code, tool calling & structured execution specialist"},
        "hue": "brand",
        "downloadUrl": "https://huggingface.co/Qwen/Qwen2.5-Coder-1.5B-Instruct-GGUF/resolve/main/qwen2.5-coder-1.5b-instruct-q4_k_m.gguf"
    },
    {
        "id": "llama3.2-1b",
        "type": "llm",
        "provider": "Meta",
        "family": "Llama",
        "name": "Llama 3.2 1B Instruct",
        "params": "1B",
        "sizeBytes": 807759872,
        "format": "GGUF",
        "quantization": "Q4_K_M",
        "languages": ["EN", "DE", "FR", "HI", "+4"],
        "execution": "local",
        "requiresDownload": True,
        "compatibility": {"level": "likely", "note": "Meta's lightweight model · Fast replies"},
        "hue": "brand",
        "downloadUrl": "https://huggingface.co/bartowski/Llama-3.2-1B-Instruct-GGUF/resolve/main/Llama-3.2-1B-Instruct-Q4_K_M.gguf"
    },
    {
        "id": "llama3.2-3b",
        "type": "llm",
        "provider": "Meta",
        "family": "Llama",
        "name": "Llama 3.2 3B Instruct",
        "params": "3B",
        "sizeBytes": 2019448832,
        "format": "GGUF",
        "quantization": "Q4_K_M",
        "languages": ["EN", "DE", "FR", "HI", "+4"],
        "execution": "local",
        "requiresDownload": True,
        "compatibility": {"level": "likely", "note": "Needs ~4 GB free RAM · Deep reasoning"},
        "hue": "brand",
        "downloadUrl": "https://huggingface.co/bartowski/Llama-3.2-3B-Instruct-GGUF/resolve/main/Llama-3.2-3B-Instruct-Q4_K_M.gguf"
    },
    {
        "id": "phi3.5-mini",
        "type": "llm",
        "provider": "Microsoft",
        "family": "Phi",
        "name": "Phi-3.5 Mini Instruct",
        "params": "3.8B",
        "sizeBytes": 2393231360,
        "format": "GGUF",
        "quantization": "Q4_K_M",
        "languages": ["EN", "+20"],
        "execution": "local",
        "requiresDownload": True,
        "compatibility": {"level": "unverified", "note": "High reasoning capacity · Needs 4-6 GB RAM"},
        "hue": "warning",
        "downloadUrl": "https://huggingface.co/bartowski/Phi-3.5-mini-instruct-GGUF/resolve/main/Phi-3.5-mini-instruct-Q4_K_M.gguf"
    },
    {
        "id": "phi4-mini-3.8b",
        "type": "llm",
        "provider": "Microsoft",
        "family": "Phi",
        "name": "Phi-4 Mini 3.8B Instruct",
        "params": "3.8B",
        "sizeBytes": 2490000000,
        "format": "GGUF",
        "quantization": "Q4_K_M",
        "languages": ["EN", "+20"],
        "execution": "local",
        "requiresDownload": True,
        "compatibility": {"level": "unverified", "note": "Microsoft's latest frontier small language model"},
        "hue": "warning",
        "downloadUrl": "https://huggingface.co/bartowski/microsoft_phi-4-mini-instruct-GGUF/resolve/main/microsoft_phi-4-mini-instruct-Q4_K_M.gguf"
    },
    {
        "id": "qwen2.5-7b",
        "type": "llm",
        "provider": "Alibaba",
        "family": "Qwen",
        "name": "Qwen 2.5 7B Instruct",
        "params": "7B",
        "sizeBytes": 4683074240,
        "format": "GGUF",
        "quantization": "Q4_K_M",
        "languages": ["EN", "ZH", "+27"],
        "execution": "local",
        "requiresDownload": True,
        "compatibility": {"level": "unlikely", "note": "Needs ~8 GB RAM; high end devices only"},
        "hue": "error",
        "downloadUrl": "https://huggingface.co/bartowski/Qwen2.5-7B-Instruct-GGUF/resolve/main/Qwen2.5-7B-Instruct-Q4_K_M.gguf"
    },
    {
        "id": "llm-companion",
        "type": "llm",
        "provider": "Companion Server",
        "family": "Remote LLM",
        "name": "Companion Backend LLM",
        "params": "Cloud/LAN",
        "sizeBytes": 0,
        "format": "FastAPI",
        "quantization": "Server-side",
        "languages": ["EN", "Multi"],
        "execution": "cloud",
        "requiresDownload": False,
        "compatibility": {"level": "likely", "note": "Delegates reasoning to companion server · 0 MB local storage"},
        "hue": "brand"
    },
    {
        "id": "gemini-2.5-flash",
        "type": "llm",
        "provider": "Google Cloud",
        "family": "Gemini",
        "name": "Gemini 2.5 Flash",
        "params": "Frontier Cloud",
        "sizeBytes": 0,
        "format": "Cloud API",
        "quantization": "FP16",
        "languages": ["EN", "Multi (+100)"],
        "execution": "cloud",
        "requiresDownload": False,
        "compatibility": {"level": "likely", "note": "Google frontier multimodal reasoning model via API"},
        "hue": "brand"
    },

    # ======================== Frontier STT Models ========================
    {
        "id": "stt-system",
        "type": "stt",
        "provider": "System Native",
        "family": "System STT",
        "name": "System Speech Recognizer",
        "params": "Built-in",
        "sizeBytes": 0,
        "format": "Native API",
        "quantization": "Native",
        "languages": ["EN", "Multi"],
        "execution": "system",
        "requiresDownload": False,
        "compatibility": {"level": "likely", "note": "Zero download · Native OS speech recognizer"},
        "hue": "success"
    },
    {
        "id": "stt-whisper-tiny",
        "type": "stt",
        "provider": "OpenAI / whisper.cpp",
        "family": "Whisper",
        "name": "Whisper Tiny (English)",
        "params": "39M",
        "sizeBytes": 77712441,
        "format": "GGML",
        "quantization": "Q16",
        "languages": ["EN"],
        "execution": "local",
        "requiresDownload": True,
        "compatibility": {"level": "likely", "note": "Ultra-compact offline STT · 74 MB download"},
        "hue": "accent",
        "downloadUrl": "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.en.bin"
    },
    {
        "id": "stt-whisper-base",
        "type": "stt",
        "provider": "OpenAI / whisper.cpp",
        "family": "Whisper",
        "name": "Whisper Base (English)",
        "params": "74M",
        "sizeBytes": 147951465,
        "format": "GGML",
        "quantization": "Q16",
        "languages": ["EN"],
        "execution": "local",
        "requiresDownload": True,
        "compatibility": {"level": "likely", "note": "Private, high accuracy offline STT · 141 MB download"},
        "hue": "brand",
        "downloadUrl": "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.en.bin"
    },
    {
        "id": "stt-whisper-small",
        "type": "stt",
        "provider": "OpenAI / whisper.cpp",
        "family": "Whisper",
        "name": "Whisper Small (Multilingual)",
        "params": "244M",
        "sizeBytes": 487951465,
        "format": "GGML",
        "quantization": "Q16",
        "languages": ["EN", "Multi (+99)"],
        "execution": "local",
        "requiresDownload": True,
        "compatibility": {"level": "likely", "note": "High-accuracy multilingual STT · ~465 MB"},
        "hue": "brand",
        "downloadUrl": "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.bin"
    },
    {
        "id": "stt-whisper-medium",
        "type": "stt",
        "provider": "OpenAI / whisper.cpp",
        "family": "Whisper",
        "name": "Whisper Medium (English)",
        "params": "769M",
        "sizeBytes": 1530000000,
        "format": "GGML",
        "quantization": "Q16",
        "languages": ["EN"],
        "execution": "local",
        "requiresDownload": True,
        "compatibility": {"level": "likely", "note": "High-accuracy English STT · ~1.5 GB"},
        "hue": "brand",
        "downloadUrl": "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-medium.en.bin"
    },
    {
        "id": "stt-whisper-large-v3-turbo",
        "type": "stt",
        "provider": "OpenAI / whisper.cpp",
        "family": "Whisper Frontier",
        "name": "Whisper Large v3 Turbo",
        "params": "809M",
        "sizeBytes": 1620000000,
        "format": "GGML",
        "quantization": "Q16",
        "languages": ["EN", "Multi (+100)"],
        "execution": "local",
        "requiresDownload": True,
        "compatibility": {"level": "likely", "note": "OpenAI's latest frontier Whisper model · 8x faster"},
        "hue": "accent",
        "downloadUrl": "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3-turbo.bin"
    },
    {
        "id": "stt-distil-whisper-large-v3",
        "type": "stt",
        "provider": "Hugging Face",
        "family": "Distil-Whisper",
        "name": "Distil-Whisper Large v3",
        "params": "756M",
        "sizeBytes": 1510000000,
        "format": "CTranslate2",
        "quantization": "INT8",
        "languages": ["EN"],
        "execution": "local",
        "requiresDownload": True,
        "compatibility": {"level": "likely", "note": "6x faster than Whisper-large with 99% accuracy"},
        "hue": "success",
        "downloadUrl": "https://huggingface.co/Systran/faster-distil-whisper-large-v3/resolve/main/model.bin"
    },
    {
        "id": "stt-moonshine-base",
        "type": "stt",
        "provider": "Useful Sensors",
        "family": "Moonshine",
        "name": "Moonshine Base STT",
        "params": "100M",
        "sizeBytes": 200000000,
        "format": "ONNX",
        "quantization": "INT8",
        "languages": ["EN"],
        "execution": "local",
        "requiresDownload": True,
        "compatibility": {"level": "likely", "note": "Frontier real-time edge speech recognition"},
        "hue": "brand",
        "downloadUrl": "https://huggingface.co/UsefulSensors/moonshine/resolve/main/base.tar.gz"
    },
    {
        "id": "stt-companion",
        "type": "stt",
        "provider": "Companion Server",
        "family": "Remote STT",
        "name": "Companion Faster-Whisper",
        "params": "Cloud/LAN",
        "sizeBytes": 0,
        "format": "FastAPI Whisper",
        "quantization": "INT8/FP16",
        "languages": ["EN", "Multi"],
        "execution": "cloud",
        "requiresDownload": False,
        "compatibility": {"level": "likely", "note": "High-throughput server-side Whisper · 0 MB local storage"},
        "hue": "brand"
    }
]

class ModelManager:
    def __init__(self):
        self.download_state: Dict[str, Dict[str, Any]] = {}
        self.selected_model_id: Optional[str] = None
        self.custom_models: Dict[str, Dict[str, Any]] = {}
        self._load_custom_models()
        self._sync_disk_models()
        self._load_selected_model()

    def _load_custom_models(self) -> None:
        try:
            stored = load_custom_models_records()
            for mid, data in stored.items():
                self.custom_models[mid.lower()] = data
        except Exception:
            pass

    def _sync_disk_models(self) -> None:
        """
        Scans MODELS_DIR for any existing .gguf and .bin files and registers them.
        """
        try:
            MODELS_DIR.mkdir(parents=True, exist_ok=True)
            for f in MODELS_DIR.glob("*.*"):
                if f.is_file() and f.suffix.lower() in [".gguf", ".bin"]:
                    model_id = f.stem
                    meta = self.find_in_baseline(model_id)
                    name = meta["name"] if meta else model_id.replace("-", " ").title()
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

    def find_in_baseline(self, model_id: str) -> Optional[Dict[str, Any]]:
        norm = model_id.lower().replace(".gguf", "").replace(".bin", "")
        for m in FRONTIER_BASELINE:
            if m["id"].lower() == norm:
                return m
        if norm in self.custom_models:
            return self.custom_models[norm]
        return None

    async def fetch_dynamic_hf(self, query: str = "gguf", model_type: str = "all", limit: int = 20) -> List[Dict[str, Any]]:
        """
        Dynamically fetches frontier models directly from Hugging Face Hub API.
        Extracts verified binary weight URLs (.gguf / .bin) with no fixed number of models.
        """
        results = []
        try:
            timeout = httpx.Timeout(connect=5.0, read=10.0, write=5.0, pool=5.0)
            async with httpx.AsyncClient(timeout=timeout) as client:
                params = {
                    "search": query,
                    "sort": "downloads",
                    "direction": "-1",
                    "limit": limit,
                    "expand[]": "siblings"
                }
                if model_type == "stt":
                    params["pipeline_tag"] = "automatic-speech-recognition"
                elif model_type == "llm":
                    params["pipeline_tag"] = "text-generation"

                url = "https://huggingface.co/api/models"
                res = await client.get(url, params=params)
                if res.status_code == 200:
                    items = res.json()
                    for item in items:
                        model_id_str = item.get("id", "")
                        if not model_id_str:
                            continue
                        author = model_id_str.split("/")[0] if "/" in model_id_str else "Community"
                        repo_name = model_id_str.split("/")[-1] if "/" in model_id_str else model_id_str
                        siblings = [s.get("rfilename", "") for s in item.get("siblings", [])]

                        is_stt = model_type == "stt" or "whisper" in model_id_str.lower() or "speech" in model_id_str.lower()
                        m_type = "stt" if is_stt else "llm"

                        # Extract exact binary weight file
                        target_file = None
                        quantization = "Dynamic"
                        format_str = "GGUF" if m_type == "llm" else "GGML"

                        if m_type == "llm":
                            gguf_candidates = [f for f in siblings if f.lower().endswith(".gguf")]
                            if gguf_candidates:
                                # Prioritize popular mobile quantizations
                                pref_order = ["q4_k_m", "q4_0", "q4_1", "q5_k_m", "q5_0", "q8_0", "f16"]
                                for pref in pref_order:
                                    match = next((f for f in gguf_candidates if pref in f.lower()), None)
                                    if match:
                                        target_file = match
                                        quantization = pref.upper()
                                        break
                                if not target_file:
                                    target_file = gguf_candidates[0]
                        else:
                            # STT candidates (.bin for whisper.cpp)
                            bin_candidates = [f for f in siblings if f.lower().endswith(".bin") and not f.endswith(".mlmodelc.zip")]
                            if bin_candidates:
                                target_file = bin_candidates[0]
                                quantization = "Q16"

                        # Build direct download URL
                        if target_file:
                            download_url = f"https://huggingface.co/{model_id_str}/resolve/main/{target_file}"
                            clean_id = f"hf-{repo_name.lower()}-{quantization.lower()}".replace(".", "-").replace("_", "-")
                        else:
                            # Fallback direct download link
                            suffix = ".bin" if m_type == "stt" else ".gguf"
                            clean_id = f"hf-{repo_name.lower().replace('.', '-')}"
                            download_url = f"https://huggingface.co/{model_id_str}/resolve/main/{repo_name}{suffix}"

                        entry = {
                            "id": clean_id,
                            "type": m_type,
                            "provider": author,
                            "family": repo_name.split("-")[0].capitalize(),
                            "name": repo_name.replace("-", " ") + (f" ({quantization})" if quantization != "Dynamic" else ""),
                            "params": "Frontier",
                            "sizeBytes": 1024 * 1024 * (500 if m_type == "stt" else 1200),
                            "format": format_str,
                            "quantization": quantization,
                            "languages": ["EN", "Multi"],
                            "execution": "local",
                            "requiresDownload": True,
                            "compatibility": {"level": "likely", "note": f"Hugging Face dynamic repository: {model_id_str}"},
                            "hue": "brand",
                            "downloadUrl": download_url
                        }
                        results.append(entry)
                        norm_clean_id = clean_id.lower()
                        self.custom_models[norm_clean_id] = entry
                        save_custom_model_record(norm_clean_id, entry)
        except Exception:
            pass
        return results

    def get_catalogue(self, provider: str = "all", model_type: str = "all", query: Optional[str] = None) -> List[ModelInfo]:
        """
        Returns full catalogue: baseline frontier models + dynamic models + custom additions.
        """
        installed_ids = set(get_installed_model_ids())
        all_models_data = list(FRONTIER_BASELINE) + list(self.custom_models.values())

        # Also dynamically discover any unregistered files in MODELS_DIR
        try:
            for f in MODELS_DIR.glob("*.*"):
                if f.is_file() and f.suffix.lower() in [".gguf", ".bin"]:
                    stem = f.stem
                    if not any(m["id"] == stem for m in all_models_data):
                        all_models_data.append({
                            "id": stem,
                            "type": "stt" if f.suffix.lower() == ".bin" else "llm",
                            "provider": "Local Disk",
                            "family": "Custom",
                            "name": stem.replace("-", " ").title(),
                            "params": "Local",
                            "sizeBytes": f.stat().st_size,
                            "format": "GGUF" if f.suffix.lower() == ".gguf" else "GGML",
                            "quantization": "Q4_K_M",
                            "languages": ["EN"],
                            "execution": "local",
                            "requiresDownload": False,
                            "compatibility": {"level": "likely", "note": "Discovered on local storage"},
                            "hue": "accent",
                            "downloadUrl": None
                        })
        except Exception:
            pass

        models = []
        for d in all_models_data:
            # Filter by type
            if model_type != "all" and d.get("type") != model_type:
                continue

            # Filter by provider
            if provider != "all" and provider.lower() not in d.get("provider", "").lower():
                continue

            # Filter by search query
            if query:
                q = query.lower()
                name_match = q in d.get("name", "").lower()
                family_match = q in d.get("family", "").lower()
                id_match = q in d.get("id", "").lower()
                if not (name_match or family_match or id_match):
                    continue

            is_dl = d["id"] in installed_ids or not d.get("requiresDownload", True)
            file_ext = ".bin" if d.get("type") == "stt" else ".gguf"
            file_path = str(MODELS_DIR / f"{d['id']}{file_ext}") if is_dl else None

            models.append(
                ModelInfo(
                    id=d["id"],
                    type=d.get("type", "llm"),
                    provider=d.get("provider", "Hugging Face"),
                    family=d["family"],
                    name=d["name"],
                    params=d["params"],
                    sizeBytes=d["sizeBytes"],
                    format=d["format"],
                    quantization=d["quantization"],
                    languages=d["languages"],
                    execution=d.get("execution", "local"),
                    requiresDownload=d.get("requiresDownload", True),
                    compatibility=ModelCompatibility(**d["compatibility"]),
                    hue=d["hue"],
                    isDownloaded=is_dl,
                    filePath=file_path,
                    downloadUrl=d.get("downloadUrl")
                )
            )
        return models

    def get_state(self) -> ModelStateResponse:
        installed = get_installed_model_ids()
        sel = self.selected_model_id if self.selected_model_id in installed else (installed[0] if installed else None)
        return ModelStateResponse(installed=installed, selected=sel)

    async def select_model(self, model_id: str) -> None:
        validate_model_id(model_id)
        models_root = MODELS_DIR.resolve()
        model_file = (models_root / f"{model_id}.gguf").resolve()
        if not model_file.is_relative_to(models_root):
            raise ValueError(f"Path traversal detected: model ID '{model_id}' resolves outside models directory")

        self.selected_model_id = model_id
        with get_connection() as conn:
            conn.execute(
                "INSERT OR REPLACE INTO app_settings (key, value) VALUES ('selected_model', ?)",
                (model_id,)
            )
            conn.commit()

        # Switch local inference server to this model if it's installed
        if model_file.exists():
            await asyncio.to_thread(local_llm.ensure_server, model_id, model_file)

    def add_custom_model(self, model_data: Dict[str, Any]) -> Optional[ModelInfo]:
        mid = model_data.get("id", "").strip()
        validate_model_id(mid)
        norm_id = mid.lower()
        model_data["id"] = mid
        self.custom_models[norm_id] = model_data
        save_custom_model_record(norm_id, model_data)
        catalogue = self.get_catalogue()
        return next((m for m in catalogue if m.id.lower() == norm_id), None)

    def get_progress(self, model_id: str) -> Dict[str, Any]:
        validate_model_id(model_id)
        if model_id in self.download_state:
            return self.download_state[model_id]

        if model_id in get_installed_model_ids():
            return {"progress": 1.0, "status": "installed", "downloadedBytes": 0, "totalBytes": 0}

        return {"progress": 0.0, "status": "idle", "downloadedBytes": 0, "totalBytes": 0}

    async def download_model(self, model_id: str) -> bool:
        validate_model_id(model_id)
        meta = self.find_in_baseline(model_id)
        if not meta:
            raise ValueError(f"Unknown model ID: {model_id}")

        url = meta.get("downloadUrl")
        if not url:
            raise ValueError(f"No download URL configured for model {model_id}")

        models_root = MODELS_DIR.resolve()
        file_ext = ".bin" if meta.get("type") == "stt" else ".gguf"
        file_path = (models_root / f"{model_id}{file_ext}").resolve()
        tmp_path = (models_root / f"{model_id}{file_ext}.tmp").resolve()

        if not file_path.is_relative_to(models_root) or not tmp_path.is_relative_to(models_root):
            raise ValueError(f"Path traversal detected: model ID '{model_id}' resolves outside models directory")

        self.download_state[model_id] = {
            "progress": 0.01,
            "downloadedBytes": 0,
            "totalBytes": meta["sizeBytes"],
            "status": "downloading",
            "error": None
        }

        try:
            timeout = httpx.Timeout(connect=15.0, read=300.0, write=60.0, pool=15.0)
            headers = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) VoiceAssistant/1.0"}

            async with httpx.AsyncClient(follow_redirects=True, timeout=timeout) as client:
                async with client.stream("GET", url, headers=headers) as response:
                    if response.status_code != 200:
                        raise RuntimeError(f"Download server returned HTTP status {response.status_code}")

                    total = int(response.headers.get("content-length", 0)) or meta["sizeBytes"]
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

            if tmp_path.exists():
                if file_path.exists():
                    file_path.unlink()
                tmp_path.rename(file_path)

            actual_size = file_path.stat().st_size
            register_model_record(
                model_id=model_id,
                name=meta["name"],
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

            if meta.get("type") == "llm":
                if not self.selected_model_id or self.selected_model_id not in get_installed_model_ids():
                    await self.select_model(model_id)

            return True

        except Exception as e:
            if tmp_path.exists():
                tmp_path.unlink(missing_ok=True)
            self.download_state[model_id] = {
                "progress": 0.0,
                "downloadedBytes": 0,
                "totalBytes": meta["sizeBytes"],
                "status": "error",
                "error": str(e)
            }
            raise e

    def delete_model(self, model_id: str) -> None:
        validate_model_id(model_id)
        norm_id = model_id.lower().strip()
        models_root = MODELS_DIR.resolve()

        for ext in [".gguf", ".bin"]:
            fp = (models_root / f"{model_id}{ext}").resolve()
            tp = (models_root / f"{model_id}{ext}.tmp").resolve()
            if not fp.is_relative_to(models_root) or not tp.is_relative_to(models_root):
                raise ValueError(f"Path traversal detected: model ID '{model_id}' resolves outside models directory")
            if fp.exists():
                fp.unlink(missing_ok=True)
            if tp.exists():
                tp.unlink(missing_ok=True)

        delete_model_record(model_id)
        delete_custom_model_record(norm_id)
        self.custom_models.pop(norm_id, None)
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
            return 25 * (1024 ** 3)

model_manager = ModelManager()
