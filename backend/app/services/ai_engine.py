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

        # 2. Reminder
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

        # 3. Message / WhatsApp Draft
        msg_match = re.search(r"(?:whatsapp|message|text|send message to|draft to)\s+([a-zA-Z]+)(?:\s+(?:saying|that|with text)?\s*[:,-]?\s*(.+))?", t, re.IGNORECASE)
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
        selected_id = model_manager.selected_model_id
        if selected_id:
            model_file = MODELS_DIR / f"{selected_id}.gguf"
            if model_file.exists():
                # Ensure server is running for this model
                server_ok = local_llm.ensure_server(selected_id, model_file)
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
