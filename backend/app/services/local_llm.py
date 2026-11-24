import hashlib
import io
import logging
import os
import platform
import signal
import subprocess
import sys
import time
import urllib.request
import zipfile
from pathlib import Path
from typing import Dict, List, Optional
import httpx
import psutil
from backend.app.config import BASE_DIR, MODELS_DIR

logger = logging.getLogger(__name__)

BIN_DIR = BASE_DIR / "bin"
IS_WINDOWS = sys.platform.startswith("win")
LLAMA_SERVER_BIN = BIN_DIR / ("llama-server.exe" if IS_WINDOWS else "llama-server")

# Pinned SHA-256 checksums for llama.cpp release b12470 binaries.
# Can also be specified via the VA_LLAMA_CPP_SHA256 environment variable.
PINNED_LLAMA_CHECKSUMS: Dict[str, str] = {
    # Populated or overridden via VA_LLAMA_CPP_SHA256
}

class LocalLLMManager:
    """
    Manages local llama-server process for executing GGUF models offline.
    Resilient to orphaned processes, port reuse, and server reloads.
    """
    def __init__(self, port: int = 8082):
        self.port = port
        self.current_model_id: Optional[str] = None
        self.process: Optional[subprocess.Popen] = None
        self.client = httpx.AsyncClient(base_url=f"http://127.0.0.1:{self.port}", timeout=60.0)

    def is_binary_available(self) -> bool:
        return LLAMA_SERVER_BIN.exists()

    def ensure_binary(self) -> bool:
        if self.is_binary_available():
            return True
        try:
            BIN_DIR.mkdir(parents=True, exist_ok=True)
            bin_dir_resolved = BIN_DIR.resolve()

            machine = platform.machine().lower()
            if IS_WINDOWS:
                asset = "llama-b12470-bin-win-cpu-x64.zip"
            elif sys.platform.startswith("darwin"):
                asset = "llama-b12470-bin-macos-arm64.zip" if ("arm" in machine or "aarch64" in machine) else "llama-b12470-bin-macos-x64.zip"
            else:
                asset = "llama-b12470-bin-ubuntu-x64.zip"

            url = f"https://github.com/ggml-org/llama.cpp/releases/download/b12470/{asset}"
            req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
            with urllib.request.urlopen(req, timeout=30) as resp:
                data = resp.read()

            # Verify downloaded archive against pinned or configured SHA-256 checksum
            expected_sha256 = os.getenv("VA_LLAMA_CPP_SHA256") or PINNED_LLAMA_CHECKSUMS.get(asset)
            if not expected_sha256:
                logger.error(
                    "Binary archive verification failed: no pinned SHA-256 checksum configured for '%s'. "
                    "Set VA_LLAMA_CPP_SHA256 env var to proceed.",
                    asset
                )
                return False

            computed_sha256 = hashlib.sha256(data).hexdigest().lower()
            if computed_sha256 != expected_sha256.lower():
                logger.error(
                    "Binary archive checksum mismatch for '%s': expected %s, got %s",
                    asset, expected_sha256, computed_sha256
                )
                return False

            # Validate zip member paths against Zip Slip before extraction
            with zipfile.ZipFile(io.BytesIO(data)) as z:
                for member in z.infolist():
                    member_target = (bin_dir_resolved / member.filename).resolve()
                    if not member_target.is_relative_to(bin_dir_resolved):
                        logger.error("Zip Slip attempt detected in member '%s'", member.filename)
                        return False
                z.extractall(bin_dir_resolved)

            if not IS_WINDOWS and LLAMA_SERVER_BIN.exists():
                LLAMA_SERVER_BIN.chmod(0o755)

            return self.is_binary_available()
        except Exception as e:
            logger.error("Failed to ensure llama-server binary: %s", str(e))
            return False

    def check_health(self) -> bool:
        """Checks if llama-server is actively responding on HTTP port."""
        try:
            with httpx.Client(base_url=f"http://127.0.0.1:{self.port}", timeout=0.8) as check:
                res = check.get("/health")
                return res.status_code == 200
        except Exception:
            return False

    def get_loaded_model(self) -> Optional[str]:
        """Queries the running llama-server for the currently loaded model ID."""
        try:
            with httpx.Client(base_url=f"http://127.0.0.1:{self.port}", timeout=1.0) as check:
                res = check.get("/v1/models")
                if res.status_code == 200:
                    data = res.json()
                    models = data.get("data") or data.get("models") or []
                    if models:
                        raw_id = models[0].get("id") or models[0].get("name") or ""
                        if raw_id:
                            stem = Path(raw_id).stem.lower()
                            return stem
        except Exception:
            pass
        return self.current_model_id

    def is_running(self) -> bool:
        """
        True if either our subprocess is active OR an existing llama-server
        is alive and answering health checks on self.port.
        """
        if self.process is not None:
            if self.process.poll() is None:
                return True
            self.process = None

        # Verify whether an active server is running on the port
        if self.check_health():
            loaded = self.get_loaded_model()
            if loaded:
                self.current_model_id = loaded
            return True

        return False

    def kill_port_holder(self) -> None:
        """Safely terminates only llama-server processes occupying the local server port or tracked child PIDs."""
        # 1. Terminate tracked subprocess if active
        if self.process is not None:
            try:
                if self.process.poll() is None:
                    self.process.terminate()
                    try:
                        self.process.wait(timeout=2)
                    except Exception:
                        self.process.kill()
            except Exception:
                pass
            self.process = None

        # 2. Inspect processes safely via psutil matching llama-server (no shell=True)
        try:
            current_pid = os.getpid()
            try:
                for conn in psutil.net_connections(kind="inet"):
                    if conn.laddr and conn.laddr.port == self.port and conn.status == psutil.CONN_LISTEN:
                        pid = conn.pid
                        if pid and pid != current_pid:
                            try:
                                proc = psutil.Process(pid)
                                p_name = (proc.name() or "").lower()
                                if "llama-server" in p_name or "llama_server" in p_name:
                                    proc.terminate()
                                    try:
                                        proc.wait(timeout=2)
                                    except psutil.TimeoutExpired:
                                        proc.kill()
                            except (psutil.NoSuchProcess, psutil.AccessDenied):
                                pass
            except (psutil.AccessDenied, Exception):
                for proc in psutil.process_iter(["pid", "name"]):
                    try:
                        p_name = (proc.info.get("name") or "").lower()
                        if ("llama-server" in p_name or "llama_server" in p_name) and proc.info.get("pid") != current_pid:
                            try:
                                for c in proc.net_connections(kind="inet"):
                                    if c.laddr and c.laddr.port == self.port:
                                        proc.terminate()
                                        try:
                                            proc.wait(timeout=2)
                                        except psutil.TimeoutExpired:
                                            proc.kill()
                                        break
                            except (psutil.NoSuchProcess, psutil.AccessDenied):
                                pass
                    except (psutil.NoSuchProcess, psutil.AccessDenied):
                        pass
        except Exception:
            pass

    def stop_server(self):
        """Stops the running llama-server and frees the port."""
        if self.process:
            try:
                self.process.terminate()
                self.process.wait(timeout=2)
            except Exception:
                try:
                    self.process.kill()
                except Exception:
                    pass
            self.process = None

        if self.check_health():
            self.kill_port_holder()
            time.sleep(0.3)

        self.current_model_id = None

    def ensure_server(self, model_id: str, model_path: Path) -> bool:
        """
        Ensures llama-server is running with the specified GGUF model file.
        Reuses existing healthy server if already loaded with the same model.
        """
        if not self.is_binary_available():
            if not self.ensure_binary():
                return False

        if not model_path.exists():
            return False

        norm_id = model_id.lower().replace(".gguf", "")

        # Check if already running with the target model
        if self.check_health():
            loaded = self.get_loaded_model()
            if loaded and (norm_id in loaded or loaded in norm_id):
                self.current_model_id = norm_id
                return True

        # Need to start or swap server
        self.stop_server()

        cmd = [
            str(LLAMA_SERVER_BIN),
            "-m", str(model_path),
            "--port", str(self.port),
            "-c", "2048",
            "--threads", "4"
        ]

        try:
            self.process = subprocess.Popen(
                cmd,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                creationflags=subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0
            )
            self.current_model_id = norm_id

            # Wait up to 6 seconds for server readiness
            for _ in range(30):
                time.sleep(0.2)
                if self.check_health():
                    return True
                if self.process and self.process.poll() is not None:
                    break

            return False
        except Exception:
            self.process = None
            self.current_model_id = None
            return False

    async def chat_completion(
        self,
        messages: List[Dict[str, str]],
        temperature: float = 0.7,
        max_tokens: int = 256
    ) -> Optional[str]:
        if not self.is_running():
            return None

        try:
            res = await self.client.post(
                "/v1/chat/completions",
                json={
                    "messages": messages,
                    "temperature": temperature,
                    "max_tokens": max_tokens,
                }
            )
            if res.status_code == 200:
                data = res.json()
                content = data["choices"][0]["message"]["content"]
                return content.strip()
        except Exception:
            return None
        return None

local_llm = LocalLLMManager()
