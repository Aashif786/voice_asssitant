import os
import signal
import subprocess
import sys
import time
from pathlib import Path
from typing import Dict, List, Optional
import httpx
from backend.app.config import BASE_DIR, MODELS_DIR

BIN_DIR = BASE_DIR / "bin"
IS_WINDOWS = sys.platform.startswith("win")
LLAMA_SERVER_BIN = BIN_DIR / ("llama-server.exe" if IS_WINDOWS else "llama-server")

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
            import io
            import platform
            import urllib.request
            import zipfile
            BIN_DIR.mkdir(parents=True, exist_ok=True)

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
                with zipfile.ZipFile(io.BytesIO(data)) as z:
                    z.extractall(BIN_DIR)

            if not IS_WINDOWS and LLAMA_SERVER_BIN.exists():
                LLAMA_SERVER_BIN.chmod(0o755)

            return self.is_binary_available()
        except Exception:
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
        """Forcefully terminates any process occupying the local server port."""
        try:
            if IS_WINDOWS:
                output = subprocess.check_output(
                    f"netstat -ano | findstr :{self.port}",
                    shell=True,
                    text=True,
                    stderr=subprocess.DEVNULL
                )
                for line in output.strip().splitlines():
                    parts = line.strip().split()
                    if len(parts) >= 5 and "LISTENING" in parts:
                        pid = parts[-1]
                        if pid.isdigit() and int(pid) != os.getpid():
                            subprocess.run(f"taskkill /F /PID {pid}", shell=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            else:
                subprocess.run(f"lsof -ti :{self.port} | xargs kill -9", shell=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
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
