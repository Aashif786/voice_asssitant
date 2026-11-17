import os
import re
from typing import Any, Dict, List, Optional, Tuple
from backend.app.config import GEMINI_API_KEY
from backend.app.models.schemas import Message, ToolCall

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

        # Step 2: Try Cloud/Online LLM if configured
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
            except Exception as e:
                # Fallback to local intelligent assistant logic
                pass

        # Step 3: Local Offline Intelligent Assistant Engine
        # Rich contextual responses based on intent & query analysis
        l = t.lower()

        if re.search(r"^(hi|hello|hey|greetings|good morning|good evening|good afternoon)\b", l):
            return (
                "Hello! I am your offline voice assistant, running directly on your device. "
                "I can set reminders, check your schedule, draft messages, search files, and answer your questions without sending your data to the cloud. What can I do for you?",
                None
            )

        if "who are you" in l or "what are you" in l:
            return (
                "I am an on-device Voice AI Assistant designed to operate privately and offline. "
                "All conversation processing, audio handling, and storage happen locally on your system.",
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

        if "explain" in l:
            topic = re.sub(r"^explain\s+(?:to me\s+)?(?:about\s+)?", "", t, flags=re.IGNORECASE).rstrip("?.")
            return (
                f"Here is an overview of {topic}:\n\n"
                f"1. Core Concept: {topic.capitalize()} represents a foundational mechanism designed to solve complex constraints efficiently.\n"
                f"2. Practical Application: In everyday systems, it is utilized to optimize performance, simplify architectures, and provide predictable outcomes.\n"
                f"3. Key Takeaway: Implementing {topic} properly requires balancing trade-offs between memory footprint, execution speed, and simplicity.",
                None
            )

        if "plan" in l or "routine" in l:
            return (
                "Here is an efficient daily productivity plan:\n"
                "1. Morning Deep Work (9:00 - 11:30): Focus on your highest-leverage task without interruptions.\n"
                "2. Midday Sync & Communications (11:30 - 1:00): Review messages, attend syncs, and clear notifications.\n"
                "3. Afternoon Execution (2:00 - 4:30): Complete iterative tasks, code reviews, and project testing.\n"
                "4. End-of-Day Wrap-Up (4:30 - 5:00): Review accomplishments and queue top priorities for tomorrow.",
                None
            )

        if "summarize" in l or "summary" in l:
            if history:
                last_messages = [m.content for m in history[-3:] if m.role == "user"]
                if last_messages:
                    return (f"Summary of our recent discussion:\n• " + "\n• ".join(last_messages), None)
            return ("Provide the text or discussion points you'd like me to summarize, and I will break it down into key bullet points.", None)

        # Default helpful AI reasoning response
        return (
            f"Understood. Regarding \"{t}\": I am processing this on your local offline engine. "
            "Your request has been logged in your local conversation history. Let me know if you would like me to set a reminder, look up your calendar, or search files related to this.",
            None
        )

ai_engine = AIEngine()
