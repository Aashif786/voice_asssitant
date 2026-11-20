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

    def is_running(self) -> bool:
        if self.process is None:
            return False
        if self.process.poll() is not None:
            self.process = None
            return False
        return True

    def stop_server(self):
        if self.process:
            try:
                self.process.terminate()
                self.process.wait(timeout=3)
            except Exception:
                try:
                    self.process.kill()
                except Exception:
                    pass
            self.process = None
            self.current_model_id = None

    def ensure_server(self, model_id: str, model_path: Path) -> bool:
        """
        Ensures llama-server is running with the specified GGUF model file.
        """
        if not self.is_binary_available():
            if not self.ensure_binary():
                return False

        if not model_path.exists():
            return False

        if self.is_running() and self.current_model_id == model_id:
            return True

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
            self.current_model_id = model_id

            # Wait for server readiness
            for _ in range(25):
                time.sleep(0.2)
                try:
                    with httpx.Client(base_url=f"http://127.0.0.1:{self.port}", timeout=1.0) as check:
                        res = check.get("/health")
                        if res.status_code == 200:
                            return True
                except Exception:
                    pass
            return False
        except Exception as e:
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
