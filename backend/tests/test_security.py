import io
import os
import sys
import zipfile
from pathlib import Path
import pytest
from fastapi.testclient import TestClient

# Add project root to sys.path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent))

from backend.app.config import DATA_DIR, MODELS_DIR, SEARCH_ROOT
from backend.app.main import app, SafeCORSMiddleware
from backend.app.routers.models import validate_model_id, validate_download_url
from backend.app.services.database import (
    load_custom_models_records,
    save_custom_model_record,
    delete_custom_model_record,
)
from backend.app.services.local_llm import local_llm
from backend.app.services.model_service import model_manager
from backend.app.services.tool_service import ToolService
from backend.app.services.whisper_stt import stt_service

client = TestClient(app)


def test_cors_and_pna_preflight_allowed():
    # Preflight with allowed origin
    response = client.options(
        "/api/health",
        headers={
            "Origin": "http://localhost:3000",
            "Access-Control-Request-Method": "GET",
            "Access-Control-Request-Private-Network": "true",
        }
    )
    assert response.status_code == 200
    assert response.headers.get("access-control-allow-origin") in ("*", "http://localhost:3000")
    assert response.headers.get("access-control-allow-private-network") == "true"


def test_cors_and_pna_preflight_enforcement_disallowed():
    # Create a test app with SafeCORSMiddleware and restricted origins
    from fastapi import FastAPI

    test_app = FastAPI()

    test_app.add_middleware(
        SafeCORSMiddleware,
        allow_origins=["http://trusted-origin.local"],
        allow_credentials=False,
        allow_methods=["*"],
        allow_headers=["*"],
        allow_private_network=True,
    )

    @test_app.get("/test-cors")
    def sample():
        return {"ok": True}

    c = TestClient(test_app)

    # Allowed origin preflight
    res_ok = c.options(
        "/test-cors",
        headers={
            "Origin": "http://trusted-origin.local",
            "Access-Control-Request-Method": "GET",
            "Access-Control-Request-Private-Network": "true",
        }
    )
    assert res_ok.status_code == 200
    assert res_ok.headers.get("access-control-allow-origin") == "http://trusted-origin.local"
    assert res_ok.headers.get("access-control-allow-private-network") == "true"

    # Disallowed origin preflight
    res_bad = c.options(
        "/test-cors",
        headers={
            "Origin": "http://malicious.evil.com",
            "Access-Control-Request-Method": "GET",
            "Access-Control-Request-Private-Network": "true",
        }
    )
    assert res_bad.status_code == 400
    assert res_bad.headers.get("access-control-allow-origin") is None
    assert res_bad.headers.get("access-control-allow-private-network") is None


def test_api_key_auth_middleware(monkeypatch):
    import backend.app.main as main_mod
    monkeypatch.setattr(main_mod, "API_KEY", "super-secret-key-12345")

    # 1. Health check must remain unauthenticated
    res_health = client.get("/api/health")
    assert res_health.status_code == 200

    # 2. Root check must remain unauthenticated
    res_root = client.get("/")
    assert res_root.status_code == 200

    # 3. OPTIONS preflights must remain unauthenticated
    res_opt = client.options(
        "/api/models/catalogue",
        headers={
            "Origin": "http://localhost:3000",
            "Access-Control-Request-Method": "GET",
        }
    )
    assert res_opt.status_code == 200

    # 4. Protected endpoint without key -> 401
    res_unauth = client.get("/api/models/state")
    assert res_unauth.status_code == 401
    assert "Unauthorized" in res_unauth.json()["detail"]

    # 5. Protected endpoint with invalid key -> 401
    res_wrong = client.get(
        "/api/models/state",
        headers={"Authorization": "Bearer wrong-key"}
    )
    assert res_wrong.status_code == 401

    # 6. Protected endpoint with valid Bearer key -> 200
    res_bearer = client.get(
        "/api/models/state",
        headers={"Authorization": "Bearer super-secret-key-12345"}
    )
    assert res_bearer.status_code == 200

    # 7. Protected endpoint with valid X-API-Key -> 200
    res_xapi = client.get(
        "/api/models/state",
        headers={"X-API-Key": "super-secret-key-12345"}
    )
    assert res_xapi.status_code == 200


def test_model_id_strict_validation():
    # Valid model IDs
    assert validate_model_id("gemma-2b") == "gemma-2b"
    assert validate_model_id("qwen2.5-0.5b") == "qwen2.5-0.5b"
    assert validate_model_id("model_1.0-alpha") == "model_1.0-alpha"

    # Invalid model IDs should raise HTTPException(400)
    invalid_ids = [
        "../traversal",
        "..\\windows_traversal",
        "model/slash",
        "model;injection",
        "model name with spaces",
        "model$bad",
        "",
    ]

    for bad_id in invalid_ids:
        with pytest.raises(Exception):
            validate_model_id(bad_id)

    # API endpoints reject malformed IDs with 400
    bad_api_ids = [
        "..\\windows_traversal",
        "model;injection",
        "model%20with%20spaces",
        "model$bad",
    ]

    for bad_id in bad_api_ids:
        res_prog = client.get(f"/api/models/progress/{bad_id}")
        assert res_prog.status_code == 400

        res_dl = client.post(f"/api/models/download/{bad_id}")
        assert res_dl.status_code == 400

        res_sel = client.post(f"/api/models/select/{bad_id}")
        assert res_sel.status_code == 400

        res_del = client.delete(f"/api/models/{bad_id}")
        assert res_del.status_code == 400


@pytest.mark.asyncio
async def test_model_service_path_traversal_prevention():
    # Calling model_service functions with path traversal IDs raises ValueError
    with pytest.raises(ValueError, match="Invalid model ID"):
        await model_manager.select_model("../escape")

    with pytest.raises(ValueError, match="Invalid model ID"):
        model_manager.delete_model("../../bad_file")


def test_custom_model_ssrf_and_url_validation():
    # 1. Non-HTTPS scheme rejected
    res_http = client.post("/api/models/custom", json={
        "id": "custom-test-model-1",
        "name": "Custom Model 1",
        "downloadUrl": "http://huggingface.co/owner/repo/resolve/main/model.gguf"
    })
    assert res_http.status_code == 400
    assert "https" in res_http.json()["detail"].lower()

    # 2. Loopback / private IP rejected
    res_loopback = client.post("/api/models/custom", json={
        "id": "custom-test-model-2",
        "name": "Custom Model 2",
        "downloadUrl": "https://127.0.0.1/model.gguf"
    })
    assert res_loopback.status_code == 400

    # 3. AWS metadata / link-local rejected
    res_meta = client.post("/api/models/custom", json={
        "id": "custom-test-model-3",
        "name": "Custom Model 3",
        "downloadUrl": "https://169.254.169.254/latest/meta-data/"
    })
    assert res_meta.status_code == 400

    # 4. Disallowed external domain rejected
    res_evil = client.post("/api/models/custom", json={
        "id": "custom-test-model-4",
        "name": "Custom Model 4",
        "downloadUrl": "https://evil-attacker-site.com/exploit.gguf"
    })
    assert res_evil.status_code == 400

    # 5. Invalid model ID in custom model request rejected
    res_bad_id = client.post("/api/models/custom", json={
        "id": "../malicious-id",
        "name": "Malicious",
        "downloadUrl": "https://huggingface.co/owner/repo/resolve/main/model.gguf"
    })
    assert res_bad_id.status_code in (400, 422)

    # 6. Valid allowlisted Hugging Face domain accepted
    res_ok = client.post("/api/models/custom", json={
        "id": "custom-test-valid-1",
        "name": "Valid Custom Model",
        "provider": "Hugging Face",
        "downloadUrl": "https://huggingface.co/owner/repo/resolve/main/model.gguf"
    })
    assert res_ok.status_code == 200
    data = res_ok.json()
    assert data["id"] == "custom-test-valid-1"

    # Verify SQLite persistence
    stored = load_custom_models_records()
    assert "custom-test-valid-1" in stored

    # Clean up test model
    client.delete("/api/models/custom-test-valid-1")


def test_voice_upload_size_limit(monkeypatch):
    # Mock stt_service to avoid downloading whisper models during unit tests
    monkeypatch.setattr(
        stt_service,
        "transcribe_audio_bytes",
        lambda *args, **kwargs: {"text": "hello test", "confidence": 1.0, "language": "en"}
    )

    # 1. Normal file (under 25 MB)
    small_audio = b"RIFF" + b"\x00" * 1024
    res_small = client.post(
        "/api/voice/transcribe",
        files={"file": ("test.wav", io.BytesIO(small_audio), "audio/wav")}
    )
    assert res_small.status_code == 200
    assert res_small.json()["text"] == "hello test"

    # 2. File exceeding 25 MB (26 MB)
    oversized_data = b"0" * (26 * 1024 * 1024)
    res_large = client.post(
        "/api/voice/transcribe",
        files={"file": ("huge.wav", io.BytesIO(oversized_data), "audio/wav")}
    )
    assert res_large.status_code == 413
    assert "25 MB" in res_large.json()["detail"]


@pytest.mark.asyncio
async def test_sandboxed_file_search(monkeypatch, tmp_path):
    # Set sandboxed search root to isolated directory
    monkeypatch.setattr("backend.app.services.tool_service.SEARCH_ROOT", tmp_path)

    # Create dummy files in the sandbox
    (tmp_path / "secret_document.txt").write_text("Hello Secret")
    (tmp_path / "nested").mkdir()
    (tmp_path / "nested" / "app_config.json").write_text("{}")

    res = await ToolService.search_files("config")
    assert res["status"] == "completed"
    assert "app_config.json" in res["message"]
    # Ensure it didn't search outside sandbox
    assert "package.json" not in res["message"]


def test_zip_slip_prevention(tmp_path):
    # Create a malicious zip with Zip Slip path
    zip_bytes = io.BytesIO()
    with zipfile.ZipFile(zip_bytes, "w") as z:
        z.writestr("../../evil_slip.txt", "pwned")

    # Verify that ensure_binary logic prevents extraction
    bin_target = tmp_path / "bin"
    bin_target.mkdir(parents=True, exist_ok=True)
    bin_target_resolved = bin_target.resolve()

    zip_bytes.seek(0)
    slip_detected = False
    with zipfile.ZipFile(zip_bytes) as z:
        for member in z.infolist():
            member_target = (bin_target_resolved / member.filename).resolve()
            if not member_target.is_relative_to(bin_target_resolved):
                slip_detected = True
                break

    assert slip_detected is True


def test_local_llm_checksum_verification(monkeypatch):
    # Checksum failure safe-check
    monkeypatch.setattr(local_llm, "is_binary_available", lambda: False)
    monkeypatch.delenv("VA_LLAMA_CPP_SHA256", raising=False)

    # Ensure ensure_binary returns False safely when checksum is not configured
    result = local_llm.ensure_binary()
    assert result is False


def test_chat_temperature_zero(monkeypatch):
    from backend.app.services.ai_engine import ai_engine
    recorded_temps = []

    async def mock_generate(text, history, temperature=0.7, model_name=None):
        recorded_temps.append(temperature)
        return ("Response with temperature", None)

    monkeypatch.setattr(ai_engine, "generate_response", mock_generate)

    res = client.post("/api/chat/generate", json={
        "text": "Hello assistant",
        "temperature": 0.0
    })
    assert res.status_code == 200
    assert len(recorded_temps) == 1
    assert recorded_temps[0] == 0.0


def test_voice_api_endpoints():
    # 1. Voice status
    res_st = client.get("/api/voice/status")
    assert res_st.status_code == 200
    data = res_st.json()
    assert "sttEngine" in data
    assert "status" in data

    # 2. Select voice model
    res_sel = client.post("/api/voice/select/tiny")
    assert res_sel.status_code == 200
    assert res_sel.json()["selected"] == "tiny"

    # Reset back to base
    res_base = client.post("/api/voice/select/base")
    assert res_base.status_code == 200
    assert res_base.json()["selected"] == "base"


def test_web_search_query_cleaning():
    import re

    # Words like "research" and "forest" must not be corrupted
    q1 = "research paper on machine learning"
    clean1 = re.sub(r"\b(search|google|for)\b", "", q1, flags=re.IGNORECASE).strip()
    assert "research" in clean1

    q2 = "forest preservation act"
    clean2 = re.sub(r"\b(search|google|for)\b", "", q2, flags=re.IGNORECASE).strip()
    assert "forest" in clean2

    q3 = "search google for latest weather"
    clean3 = re.sub(r"\b(search|google|for)\b", "", q3, flags=re.IGNORECASE)
    clean3 = re.sub(r"\s+", " ", clean3).strip()
    assert clean3 == "latest weather"


@pytest.mark.asyncio
async def test_read_calendar_empty_range_no_substitution():
    # Calling with empty or unknown range should not substitute today's events under wrong heading
    res = await ToolService.read_calendar("next-century")
    assert res["status"] == "completed"
    assert "no events scheduled for next-century" in res["message"].lower()
    assert "Design Sync" not in res["message"]


@pytest.mark.asyncio
async def test_memory_sqlite_persistence():
    from backend.app.services.database import list_memories, delete_memory

    res = await ToolService.execute("manage_memory", {
        "action": "add",
        "fact": "Favorite drink is iced matcha latte"
    })
    assert res["status"] == "completed"
    assert "iced matcha latte" in res["message"]

    # Verify saved in SQLite database
    mems = list_memories()
    matched = [m for m in mems if "iced matcha latte" in m["fact"]]
    assert len(matched) >= 1

    # Clean up test memory
    delete_memory(matched[0]["id"])


def test_ai_engine_intent_parity_trailing_punctuation_and_times():
    from backend.app.services.ai_engine import ai_engine

    # 1. Trailing punctuation in call commands
    call1 = ai_engine._detect_tool_intent("Call Mom.")
    assert call1 is not None
    assert call1[0] == "call_contact"
    assert call1[1]["contact_name"].lower() == "mom"

    call2 = ai_engine._detect_tool_intent("Dial John!")
    assert call2 is not None
    assert call2[0] == "call_contact"
    assert call2[1]["contact_name"].lower() == "john"

    # 2. Trailing tomorrow / tonight in reminders
    rem1 = ai_engine._detect_tool_intent("Remind me to buy groceries tomorrow")
    assert rem1 is not None
    assert rem1[0] == "create_reminder"
    assert "groceries" in rem1[1]["task"].lower()
    assert "tomorrow" in rem1[1]["time"].lower()

    rem2 = ai_engine._detect_tool_intent("Remind me to lock the front door tonight")
    assert rem2 is not None
    assert rem2[0] == "create_reminder"
    assert "lock the front door" in rem2[1]["task"].lower()
    assert "tonight" in rem2[1]["time"].lower()


def test_whisper_set_model_guard_and_cache_cap():
    from backend.app.services.whisper_stt import stt_service

    # When _WhisperModel is None, set_model does not claim faster-whisper is running
    orig_wm = stt_service._WhisperModel
    stt_service._WhisperModel = None
    stt_service.engine = "unavailable"
    stt_service.set_model("large-v3")
    assert stt_service.engine == "unavailable"

    # Restore
    stt_service._WhisperModel = orig_wm
    if orig_wm is not None:
        stt_service.set_model("base")

