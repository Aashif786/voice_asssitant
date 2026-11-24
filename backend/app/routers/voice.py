import asyncio
from typing import Optional
from fastapi import APIRouter, File, HTTPException, UploadFile, Form

from backend.app.models.schemas import TranscribeResponse
from backend.app.services.whisper_stt import stt_service

router = APIRouter(prefix="/api/voice", tags=["voice"])


MAX_UPLOAD_BYTES = 25 * 1024 * 1024  # 25 MB max limit
CHUNK_SIZE = 64 * 1024  # 64 KB read buffer


@router.post("/transcribe", response_model=TranscribeResponse)
async def transcribe_audio(
    file: UploadFile = File(...),
    model: Optional[str] = Form(None)
):
    try:
        chunks = []
        total_size = 0

        while True:
            chunk = await file.read(CHUNK_SIZE)
            if not chunk:
                break
            total_size += len(chunk)
            if total_size > MAX_UPLOAD_BYTES:
                raise HTTPException(
                    status_code=413,
                    detail=f"Audio file exceeds maximum allowed upload size of 25 MB ({MAX_UPLOAD_BYTES} bytes)."
                )
            chunks.append(chunk)

        content = b"".join(chunks)
        res = await asyncio.to_thread(
            stt_service.transcribe_audio_bytes,
            content,
            filename=file.filename or "audio.wav",
            model_name=model,
        )
        return TranscribeResponse(
            text=res.get("text", ""),
            confidence=res.get("confidence", 1.0),
            language=res.get("language", "en"),
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Transcription failed: {str(e)}")
    finally:
        await file.close()


@router.get("/status")
async def get_voice_status():
    return {
        "sttEngine": stt_service.engine,
        "offline": stt_service.offline_available,
        "currentModel": stt_service.current_model_name,
        "status": "ready" if stt_service.engine != "unavailable" else "unavailable",
    }


@router.post("/select/{model_name}")
async def select_voice_model(model_name: str):
    stt_service.set_model(model_name)
    return {"status": "success", "selected": model_name, "engine": stt_service.engine}
