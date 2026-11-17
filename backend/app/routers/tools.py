from typing import Any, Dict
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from backend.app.services.database import list_calendar_events, list_draft_messages, list_reminders
from backend.app.services.tool_service import ToolService

router = APIRouter(prefix="/api/tools", tags=["tools"])

class ToolExecuteRequest(BaseModel):
    tool: str
    params: Dict[str, Any] = {}

@router.get("/list")
async def list_tools():
    return [
        {
            "name": "get_time",
            "label": "Device clock",
            "mode": "OFFLINE",
            "requiresConfirmation": False,
            "params": []
        },
        {
            "name": "create_reminder",
            "label": "Reminder",
            "mode": "OFFLINE",
            "requiresConfirmation": True,
            "params": ["task", "time"]
        },
        {
            "name": "draft_message",
            "label": "WhatsApp / SMS draft",
            "mode": "OFFLINE",
            "requiresConfirmation": True,
            "params": ["recipient", "body"]
        },
        {
            "name": "read_calendar",
            "label": "Calendar",
            "mode": "OFFLINE",
            "requiresConfirmation": False,
            "params": ["range"]
        },
        {
            "name": "search_files",
            "label": "File search",
            "mode": "OFFLINE",
            "requiresConfirmation": False,
            "params": ["query"]
        },
        {
            "name": "web_search",
            "label": "Web search",
            "mode": "ONLINE",
            "requiresConfirmation": True,
            "params": ["query"]
        }
    ]

@router.post("/execute")
async def execute_tool(req: ToolExecuteRequest):
    try:
        res = await ToolService.execute(req.tool, req.params)
        return res
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Execution error: {str(e)}")

@router.get("/reminders")
async def get_reminders():
    return list_reminders()

@router.get("/calendar")
async def get_calendar(range: str = "today"):
    return list_calendar_events(range)

@router.get("/drafts")
async def get_drafts():
    return list_draft_messages()
