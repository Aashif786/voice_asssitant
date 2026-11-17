import os
import sys
from pathlib import Path
import pytest
from fastapi.testclient import TestClient

# Add project root to sys.path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent))

from backend.app.main import app

client = TestClient(app)

def test_health_check():
    response = client.get("/api/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "online"
    assert data["service"] == "Offline Voice AI Assistant"

def test_chat_greeting():
    response = client.post("/api/chat/generate", json={
        "text": "Hello there!",
        "history": []
    })
    assert response.status_code == 200
    data = response.json()
    assert "Hello" in data["text"]
    assert data["tool"] is None

def test_chat_time_tool():
    response = client.post("/api/chat/generate", json={
        "text": "What time is it right now?",
        "history": []
    })
    assert response.status_code == 200
    data = response.json()
    assert data["tool"] is not None
    assert data["tool"]["tool"] == "get_time"
    assert data["tool"]["status"] == "completed"
    assert "It is currently" in data["text"]

def test_chat_reminder_confirmation():
    response = client.post("/api/chat/generate", json={
        "text": "Remind me to call the dentist tomorrow at 10am",
        "history": []
    })
    assert response.status_code == 200
    data = response.json()
    assert data["tool"] is not None
    assert data["tool"]["tool"] == "create_reminder"
    assert data["tool"]["status"] == "pending_confirmation"
    assert "dentist" in data["tool"]["params"]["task"].lower()

def test_chat_tool_confirmation_approval():
    tool_payload = {
        "tool": "create_reminder",
        "status": "pending_confirmation",
        "params": {"task": "Buy groceries", "time": "6:00 PM"},
        "summary": "Buy groceries · 6:00 PM"
    }
    response = client.post("/api/chat/resolve-tool", json={
        "tool": tool_payload,
        "approved": True
    })
    assert response.status_code == 200
    data = response.json()
    assert data["tool"]["status"] == "completed"
    assert "Reminder set" in data["text"]

def test_chat_tool_confirmation_cancellation():
    tool_payload = {
        "tool": "create_reminder",
        "status": "pending_confirmation",
        "params": {"task": "Buy groceries", "time": "6:00 PM"},
        "summary": "Buy groceries · 6:00 PM"
    }
    response = client.post("/api/chat/resolve-tool", json={
        "tool": tool_payload,
        "approved": False
    })
    assert response.status_code == 200
    data = response.json()
    assert data["tool"]["status"] == "cancelled"
    assert "cancelled" in data["text"].lower()

def test_calendar_tool():
    response = client.post("/api/tools/execute", json={
        "tool": "read_calendar",
        "params": {"range": "today"}
    })
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "completed"
    assert "agenda" in data["message"].lower()

def test_search_files_tool():
    response = client.post("/api/tools/execute", json={
        "tool": "search_files",
        "params": {"query": "config"}
    })
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "completed"

def test_models_lifecycle():
    # 1. Catalogue
    cat_res = client.get("/api/models/catalogue")
    assert cat_res.status_code == 200
    models = cat_res.json()
    assert len(models) >= 5

    # 2. Download a model
    target_id = "gemma3-1b"
    dl_res = client.post(f"/api/models/download/{target_id}")
    assert dl_res.status_code == 200

    # 3. State check
    state_res = client.get("/api/models/state")
    assert state_res.status_code == 200
    assert target_id in state_res.json()["installed"]

    # 4. Select model
    sel_res = client.post(f"/api/models/select/{target_id}")
    assert sel_res.status_code == 200
    assert sel_res.json()["selected"] == target_id

    # 5. Storage check
    st_res = client.get("/api/models/storage")
    assert st_res.status_code == 200
    assert st_res.json()["availableBytes"] > 0

    # 6. Delete model
    del_res = client.delete(f"/api/models/{target_id}")
    assert del_res.status_code == 200

def test_system_diagnostics():
    response = client.get("/api/diagnostics/system")
    assert response.status_code == 200
    data = response.json()
    assert data["cpuCount"] >= 1
    assert data["memoryTotalGB"] > 0
    assert data["storageFreeGB"] > 0
