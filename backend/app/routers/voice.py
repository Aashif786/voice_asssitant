from fastapi import APIRouter, File, HTTPException, UploadFile

from backend.app.models.schemas import TranscribeResponse
from backend.app.services.whisper_stt import stt_service

router = APIRouter(prefix="/api/voice", tags=["voice"])


@router.post("/transcribe", response_model=TranscribeResponse)
async def transcribe_audio(file: UploadFile = File(...)):
    try:
        content = await file.read()
        res = stt_service.transcribe_audio_bytes(content, filename=file.filename or "audio.wav")
        return TranscribeResponse(
            text=res.get("text", ""),
            confidence=res.get("confidence", 1.0),
            language=res.get("language", "en"),
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Transcription failed: {str(e)}")


@router.get("/status")
async def get_voice_status():
    return {
        "sttEngine": stt_service.engine,
        "offline": stt_service.offline_available,
        "status": "ready" if stt_service.engine != "unavailable" else "unavailable",
    }
