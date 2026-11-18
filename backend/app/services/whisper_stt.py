import os
import tempfile
from typing import Any, Dict


class STTService:
    """
    Server-side speech-to-text.

    Prefers fully offline transcription with faster-whisper (Whisper running locally
    with no network). If that package is not installed it falls back to the online
    SpeechRecognition/Google path, and reports that honestly via `offline_available`.

    Note: the mobile app transcribes on-device with whisper.rn and does not depend on
    this service. It exists for the optional desktop/companion backend and for parity.
    """

    def __init__(self) -> None:
        self.engine = "none"
        self.offline_available = False
        self._WhisperModel = None
        self._fw_model = None
        self._recognizer = None
        self._sr = None

        try:
            from faster_whisper import WhisperModel  # type: ignore

            self._WhisperModel = WhisperModel
            self.engine = "faster-whisper (offline)"
            self.offline_available = True
        except Exception:
            try:
                import speech_recognition as sr  # type: ignore

                self._sr = sr
                self._recognizer = sr.Recognizer()
                self.engine = "speech_recognition (online fallback)"
            except Exception:
                self.engine = "unavailable"

    def _load_fw(self):
        if self._fw_model is None and self._WhisperModel is not None:
            size = os.getenv("VA_WHISPER_MODEL", "base")
            self._fw_model = self._WhisperModel(size, device="cpu", compute_type="int8")
        return self._fw_model

    def transcribe_audio_bytes(self, audio_bytes: bytes, filename: str = "audio.wav") -> Dict[str, Any]:
        if not audio_bytes or len(audio_bytes) < 44:
            return {"text": "", "confidence": 0.0, "language": "en"}

        temp_path = None
        try:
            suffix = os.path.splitext(filename)[1] or ".wav"
            with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tf:
                tf.write(audio_bytes)
                temp_path = tf.name

            # Offline path (preferred)
            if self._WhisperModel is not None:
                model = self._load_fw()
                segments, info = model.transcribe(temp_path, beam_size=1)
                text = " ".join(seg.text.strip() for seg in segments).strip()
                return {
                    "text": text,
                    "confidence": float(getattr(info, "language_probability", 1.0) or 1.0),
                    "language": getattr(info, "language", "en") or "en",
                }

            # Online fallback
            if self._recognizer is not None and self._sr is not None:
                with self._sr.AudioFile(temp_path) as source:
                    audio_data = self._recognizer.record(source)
                try:
                    text = self._recognizer.recognize_google(audio_data)
                    return {"text": text, "confidence": 0.9, "language": "en"}
                except self._sr.UnknownValueError:
                    return {"text": "", "confidence": 0.0, "language": "en"}
                except self._sr.RequestError:
                    return {"text": "", "confidence": 0.0, "language": "en", "error": "network_unavailable"}

            return {"text": "", "confidence": 0.0, "language": "en", "error": "no_stt_engine"}

        except Exception as e:
            return {"text": "", "confidence": 0.0, "language": "en", "error": str(e)}
        finally:
            if temp_path and os.path.exists(temp_path):
                try:
                    os.remove(temp_path)
                except Exception:
                    pass


stt_service = STTService()
