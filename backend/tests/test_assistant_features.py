import pytest
from backend.app.services.ai_engine import ai_engine
from backend.app.services.model_service import model_manager

def test_whatsapp_compound_command_detection():
    # Test case 1: The exact reported user command
    query = "Open WhatsApp and send Aashif a hi message."
    intent = ai_engine._detect_tool_intent(query)
    assert intent is not None, "Intent detection should not be None"
    tool_name, params, req_conf, summary = intent
    assert tool_name == "draft_message"
    assert params["recipient"].lower() == "aashif"
    assert params["body"].lower() == "hi"
    assert req_conf is True

def test_whatsapp_variation_commands():
    # Test case 2: Variation 1
    query = "Send Aashif a hi message on WhatsApp"
    intent = ai_engine._detect_tool_intent(query)
    assert intent is not None
    tool_name, params, req_conf, summary = intent
    assert tool_name == "draft_message"
    assert params["recipient"].lower() == "aashif"
    assert params["body"].lower() == "hi"

    # Test case 3: Variation 2
    query = "Send Aashif a meeting update message"
    intent = ai_engine._detect_tool_intent(query)
    assert intent is not None
    tool_name, params, req_conf, summary = intent
    assert tool_name == "draft_message"
    assert params["recipient"].lower() == "aashif"
    assert "meeting update" in params["body"].lower()

def test_app_launch_intent_does_not_swallow_messaging():
    # Plain app launch
    plain_app = "Open WhatsApp"
    intent = ai_engine._detect_tool_intent(plain_app)
    assert intent is not None
    tool_name, params, req_conf, summary = intent
    assert tool_name == "open_app"
    assert params["app_name"].lower() == "whatsapp"
    assert req_conf is False

    # Other apps
    chrome_app = "Open Chrome"
    intent_chrome = ai_engine._detect_tool_intent(chrome_app)
    assert intent_chrome is not None
    assert intent_chrome[0] == "open_app"
    assert intent_chrome[1]["app_name"].lower() == "chrome"

def test_model_manager_catalogue():
    catalogue = model_manager.get_catalogue()
    assert len(catalogue) >= 5
    ids = [m.id for m in catalogue]
    assert "smollm2-135m" in ids
    assert "qwen2.5-0.5b" in ids
    assert "tinyllama-1.1b" in ids

def test_device_control_intents():
    # Flashlight
    fl = ai_engine._detect_tool_intent("Turn on flashlight")
    assert fl is not None and fl[0] == "device_control"
    assert fl[1]["setting"] == "flashlight" and fl[1]["value"] == "on"

    # Battery
    bat = ai_engine._detect_tool_intent("Check battery level")
    assert bat is not None and bat[0] == "device_control"
    assert bat[1]["setting"] == "battery"

    # Time
    tm = ai_engine._detect_tool_intent("What time is it?")
    assert tm is not None and tm[0] == "get_time"
