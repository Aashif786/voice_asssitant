import os
import re
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from backend.app.config import GEMINI_API_KEY, MODELS_DIR
from backend.app.models.schemas import Message, ToolCall
from backend.app.services.local_llm import local_llm
from backend.app.services.model_service import model_manager

class AIEngine:
    def __init__(self):
        self.gemini_client = None
        if GEMINI_API_KEY:
            try:
                from google import genai
                self.gemini_client = genai.Client(api_key=GEMINI_API_KEY)
            except Exception:
                self.gemini_client = None

    def _detect_tool_intent(self, text: str) -> Optional[Tuple[str, Dict[str, str], bool, str]]:
        """
        Detects if user input maps to one of the 6 tools:
        Returns: (tool_name, params, requires_confirmation, summary)
        """
        t = text.strip()
        l = t.lower()

        # 1. Device Clock / Time
        if re.search(r"\b(what time|current time|the time|what's the date|what day is it|tell me the time)\b", l):
            return ("get_time", {}, False, "Device clock")

        # 2. Flashlight / Torch
        if re.search(r"\b(turn on flashlight|turn on torch|flashlight on|torch on|enable flashlight)\b", l):
            return ("device_control", {"setting": "flashlight", "value": "on"}, False, "Turn on flashlight")
        if re.search(r"\b(turn off flashlight|turn off torch|flashlight off|torch off|disable flashlight)\b", l):
            return ("device_control", {"setting": "flashlight", "value": "off"}, False, "Turn off flashlight")

        # 3. Battery status
        if re.search(r"\b(battery|battery level|battery percentage|battery status|how much battery|check battery)\b", l):
            return ("device_control", {"setting": "battery", "value": "check"}, False, "Check battery status")

        # 4. Volume
        vol_match = re.search(r"(?:set\s+volume\s+to|volume\s+to)\s+(\d+)%?", l)
        if vol_match:
            v = vol_match.group(1)
            return ("device_control", {"setting": "volume", "value": v}, False, f"Set volume to {v}%")

        # 5. Calling
        call_match = re.search(r"^(?:call|dial|phone)\s+([a-zA-Z0-9\s+]+)$", t, re.IGNORECASE)
        if call_match:
            contact = call_match.group(1).strip()
            return ("call_contact", {"contact_name": contact}, True, f"Call {contact}")

        # 6. High-Priority WhatsApp & Messaging Commands
        open_and_send_match = re.search(r"^(?:open\s+whatsapp\s+(?:and\s+)?send\s+([a-zA-Z0-9]+)\s+(?:a\s+)?(.+?)(?:\s+message)?[\.\?!]?)$", t, re.IGNORECASE)
        if open_and_send_match:
            recipient = open_and_send_match.group(1).capitalize()
            body = open_and_send_match.group(2).strip()
            if body.lower().endswith(" message"):
                body = body[:-8].strip()
            return ("draft_message", {"recipient": recipient, "body": body}, True, f"WhatsApp to {recipient}: \"{body}\"")

        send_via_wa_match = re.search(r"^(?:send\s+([a-zA-Z0-9]+)\s+(?:a\s+)?(.+?)(?:\s+message)?\s+(?:on|via)\s+whatsapp[\.\?!]?)$", t, re.IGNORECASE)
        if send_via_wa_match:
            recipient = send_via_wa_match.group(1).capitalize()
            body = send_via_wa_match.group(2).strip()
            if body.lower().endswith(" message"):
                body = body[:-8].strip()
            return ("draft_message", {"recipient": recipient, "body": body}, True, f"WhatsApp to {recipient}: \"{body}\"")

        send_a_msg_match = re.search(r"^(?:send\s+([a-zA-Z0-9]+)\s+a\s+(.+?)\s+message[\.\?!]?)$", t, re.IGNORECASE)
        if send_a_msg_match:
            recipient = send_a_msg_match.group(1).capitalize()
            body = send_a_msg_match.group(2).strip()
            return ("draft_message", {"recipient": recipient, "body": body}, True, f"Message to {recipient}: \"{body}\"")

        # 7. App Launch (evaluated after messaging to avoid greedily swallowing 'Open WhatsApp and send...')
        open_app_match = re.search(r"^(?:open|launch|start)\s+([a-zA-Z0-9\s]+?)[\.\?!]?$", t, re.IGNORECASE)
        if open_app_match:
            candidate = open_app_match.group(1).strip()
            if " and " not in candidate.lower() and candidate.lower() not in ["calendar", "schedule", "agenda", "reminders"]:
                return ("open_app", {"app_name": candidate}, False, f"Open {candidate}")

        # 8. Reminder
        remind_match = re.search(r"remind me (?:to )?(.+?)(?:\s+(?:at|by|on|tomorrow|tonight|in)\s+(.+))?$", t, re.IGNORECASE)
        if remind_match:
            task = remind_match.group(1).strip()
            time_spec = remind_match.group(2).strip() if remind_match.group(2) else "Later today"
            return (
                "create_reminder",
                {"task": task.capitalize(), "time": time_spec},
                True,
                f"{task.capitalize()} · {time_spec}"
            )

        # 9. Generic Message / WhatsApp Draft
        msg_match = re.search(r"(?:whatsapp|message|text|send message to|draft to)\s+([a-zA-Z0-9]+)(?:\s+(?:saying|that|with text)?\s*[:,-]?\s*(.+))?", t, re.IGNORECASE)
        if msg_match:
            recipient = msg_match.group(1).capitalize()
            body = msg_match.group(2).strip() if msg_match.group(2) else f"Hi {recipient}, checking in with you."
            return (
                "draft_message",
                {"recipient": recipient, "body": body},
                True,
                f"To {recipient}"
            )

        # 4. Calendar / Schedule
        if re.search(r"\b(calendar|schedule|agenda|meetings?|appointments?)\b", l):
            range_type = "today"
            if "tomorrow" in l:
                range_type = "tomorrow"
            elif "week" in l:
                range_type = "week"
            elif "all" in l or "upcoming" in l:
                range_type = "all"
            return ("read_calendar", {"range": range_type}, False, f"Calendar ({range_type})")

        # 5. File search
        file_match = re.search(r"\b(?:search|find|look for)\s+(?:files?|documents?|code)\s*(?:named|matching|for)?\s*(.+)", t, re.IGNORECASE)
        if file_match:
            q = file_match.group(1).strip()
            return ("search_files", {"query": q}, False, f"File search: {q}")
        elif re.search(r"\b(files?|downloads?|documents?)\b", l) and len(t.split()) <= 4:
            return ("search_files", {"query": t}, False, f"File search: {t}")

        # 6. Web search
        search_match = re.search(r"\b(?:search the web for|google|web search|look up online)\s+(.+)", t, re.IGNORECASE)
        if search_match:
            q = search_match.group(1).strip()
            return ("web_search", {"query": q}, True, f"Search web: {q}")

        return None

    async def generate_response(
        self,
        text: str,
        history: List[Message],
        temperature: float = 0.7,
        model_name: Optional[str] = None
    ) -> Tuple[str, Optional[ToolCall]]:
        t = text.strip()

        # Step 1: Check for Tool Intent
        tool_intent = self._detect_tool_intent(t)
        if tool_intent:
            tool_name, params, req_conf, summary = tool_intent
            if req_conf:
                tool_call = ToolCall(
                    tool=tool_name,
                    status="pending_confirmation",
                    params=params,
                    summary=summary
                )
                if tool_name == "create_reminder":
                    intro = f"I've prepared a reminder for you: \"{params['task']}\" at {params['time']}. Confirm to set it."
                elif tool_name == "draft_message":
                    intro = f"I've prepared a draft message for {params['recipient']}. Review before confirming:"
                elif tool_name == "web_search":
                    intro = f"Searching the web needs an active internet connection. Confirm to search online for \"{params['query']}\"."
                else:
                    intro = "Action prepared. Please confirm to continue:"
                return (intro, tool_call)
            else:
                # Immediate tool execution (clock, calendar, file search)
                from backend.app.services.tool_service import ToolService
                tool_out = await ToolService.execute(tool_name, params)
                tool_call = ToolCall(
                    tool=tool_name,
                    status=tool_out["status"],
                    params=params,
                    summary=summary
                )
                return (tool_out["message"], tool_call)

        # Step 2: Try Local Offline LLM Execution (real GGUF model via llama.cpp)
        target_id = model_name or model_manager.selected_model_id
        model_file = None

        if target_id and target_id != "llm-companion":
            candidate = MODELS_DIR / f"{target_id}.gguf"
            if candidate.exists():
                model_file = candidate

        # If selected model is "llm-companion" or file not found, resolve to any available GGUF model
        if not model_file:
            from backend.app.services.database import get_installed_model_ids
            installed = get_installed_model_ids()
            candidates_to_try = []
            if target_id:
                candidates_to_try.append(target_id)
            candidates_to_try.extend(["qwen2.5-0.5b", "smollm2-135m"])
            candidates_to_try.extend(installed)
            for cand_id in candidates_to_try:
                cand_path = MODELS_DIR / f"{cand_id}.gguf"
                if cand_path.exists():
                    model_file = cand_path
                    target_id = cand_id
                    break

        # Check if local_llm server is already alive
        server_ok = False
        if model_file and target_id:
            server_ok = local_llm.ensure_server(target_id, model_file)
        elif local_llm.is_running():
            server_ok = True

        if server_ok:
            messages = [
                {
                    "role": "system",
                    "content": (
                        "You are a concise, helpful offline on-device AI voice assistant. "
                        "Provide clear, direct answers without unnecessary fluff."
                    )
                }
            ]
            for m in history[-6:]:
                r = "assistant" if m.role == "assistant" else "user"
                messages.append({"role": r, "content": m.content})
            messages.append({"role": "user", "content": t})

            try:
                reply = await local_llm.chat_completion(
                    messages=messages,
                    temperature=temperature,
                    max_tokens=256
                )
                if reply:
                    return (reply, None)
            except Exception:
                pass

        # Step 3: Try Cloud LLM if configured and local model not active
        if self.gemini_client:
            try:
                prompt_parts = []
                for m in history[-6:]:
                    prompt_parts.append(f"{m.role.capitalize()}: {m.content}")
                prompt_parts.append(f"User: {t}")
                prompt = "\n".join(prompt_parts)

                response = self.gemini_client.models.generate_content(
                    model="gemini-2.5-flash",
                    contents=prompt
                )
                if response and response.text:
                    return (response.text.strip(), None)
            except Exception:
                pass

        # Step 4: Fallback Intelligent On-Device Logic
        l = t.lower()

        if re.search(r"^(hi|hello|hey|greetings|good morning|good evening|good afternoon)\b", l):
            return (
                "Hello! I am your offline voice assistant, running directly on your device. "
                "I can set reminders, check your schedule, draft messages, search files, and answer questions. What can I do for you?",
                None
            )

        if "who are you" in l or "what are you" in l:
            return (
                "I am an on-device Voice AI Assistant designed to operate privately and offline. "
                "All conversation processing, audio handling, and model execution happen locally on your system.",
                None
            )

        if "what can you do" in l or "help" in l:
            return (
                "Here are some things I can do for you right now:\n"
                "• Check time and date (\"What time is it?\")\n"
                "• Set reminders (\"Remind me to call the doctor tomorrow at 10am\")\n"
                "• View your calendar schedule (\"Show my agenda for today\")\n"
                "• Draft WhatsApp messages (\"Message Sarah that I will be late\")\n"
                "• Search files in workspace (\"Find files matching config\")\n"
                "• Search the web with confirmation (\"Search the web for quantum computing\")\n"
                "• Manage on-device AI models in the Models tab",
                None
            )

        # General helpful on-device response
        return (
            f"I processed your query: \"{t}\". To get full conversational reasoning offline, "
            f"make sure a local model is downloaded and selected in the Models tab.",
            None
        )

ai_engine = AIEngine()
