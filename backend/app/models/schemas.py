from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field

class ToolCall(BaseModel):
    tool: str
    status: str = "pending_confirmation"  # "pending_confirmation" | "completed" | "cancelled" | "unavailable"
    params: Dict[str, Any] = Field(default_factory=dict)
    summary: str = ""

class Message(BaseModel):
    id: str
    conversationId: Optional[str] = None
    role: str  # "user" | "assistant"
    content: str
    createdAt: Optional[int] = None
    tool: Optional[ToolCall] = None

class ChatRequest(BaseModel):
    text: str
    history: List[Message] = Field(default_factory=list)
    conversationId: Optional[str] = None
    temperature: Optional[float] = 0.7
    model: Optional[str] = None

class ChatResponse(BaseModel):
    text: str
    tool: Optional[ToolCall] = None
    conversationId: Optional[str] = None

class ToolConfirmationRequest(BaseModel):
    tool: ToolCall
    approved: bool

class ToolResult(BaseModel):
    status: str
    message: str

class TranscribeResponse(BaseModel):
    text: str
    confidence: float = 1.0
    language: str = "en"

class ModelCompatibility(BaseModel):
    level: str  # "likely" | "unverified" | "unlikely"
    note: str

class ModelInfo(BaseModel):
    id: str
    family: str
    name: str
    params: str
    sizeBytes: int
    format: str
    quantization: str
    languages: List[str]
    compatibility: ModelCompatibility
    hue: str
    isDownloaded: bool = False
    filePath: Optional[str] = None

class ModelStateResponse(BaseModel):
    installed: List[str] = Field(default_factory=list)
    selected: Optional[str] = None

class SystemDiagnosticsResponse(BaseModel):
    platform: str
    cpuCount: int
    memoryTotalGB: float
    memoryAvailableGB: float
    storageFreeGB: float
    storageTotalGB: float
    whisperAvailable: bool
    pythonVersion: str
    activeModel: Optional[str]
    installedModelsCount: int
