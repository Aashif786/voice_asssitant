from fastapi import APIRouter, HTTPException
from backend.app.models.schemas import (
    ChatRequest,
    ChatResponse,
    ToolConfirmationRequest,
    ToolCall,
)
from backend.app.services.ai_engine import ai_engine
from backend.app.services.tool_service import ToolService

router = APIRouter(prefix="/api/chat", tags=["chat"])

@router.post("/generate", response_model=ChatResponse)
async def generate_chat(req: ChatRequest):
    try:
        reply_text, tool_call = await ai_engine.generate_response(
            text=req.text,
            history=req.history,
            temperature=req.temperature or 0.7,
            model_name=req.model
        )
        return ChatResponse(
            text=reply_text,
            tool=tool_call,
            conversationId=req.conversationId
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Generation failed: {str(e)}")

@router.post("/resolve-tool", response_model=ChatResponse)
async def resolve_tool_confirmation(req: ToolConfirmationRequest):
    try:
        if not req.approved:
            updated_tool = req.tool.model_copy()
            updated_tool.status = "cancelled"
            return ChatResponse(
                text="Action cancelled. Nothing was changed on your device.",
                tool=updated_tool
            )

        # Execute confirmed tool
        res = await ToolService.execute(req.tool.tool, req.tool.params)
        updated_tool = req.tool.model_copy()
        updated_tool.status = res["status"]

        return ChatResponse(
            text=res["message"],
            tool=updated_tool
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Tool resolution failed: {str(e)}")
