import os
import subprocess
import tempfile
from typing import Any, Dict, Optional


class STTService:
    """
    Server-side speech-to-text service with multi-model support.
    Prefers faster-whisper (Whisper running locally offline with CTranslate2).
    Falls back to SpeechRecognition if needed, and handles audio conversion with ffmpeg.
    """

    def __init__(self) -> None:
        self.engine = "none"
        self.offline_available = False
        self.current_model_name = os.getenv("VA_WHISPER_MODEL", "base")
        self._WhisperModel = None
        self._fw_models: Dict[str, Any] = {}
        self._recognizer = None
        self._sr = None

        self._init_engine()

    def _init_engine(self):
        try:
            from faster_whisper import WhisperModel  # type: ignore

            self._WhisperModel = WhisperModel
            self.engine = f"faster-whisper [{self.current_model_name}]"
            self.offline_available = True
        except Exception:
            try:
                import speech_recognition as sr  # type: ignore

                self._sr = sr
                self._recognizer = sr.Recognizer()
                self.engine = "speech_recognition (online fallback)"
                self.offline_available = False
            except Exception:
                self.engine = "unavailable"
                self.offline_available = False

    def set_model(self, model_name: str) -> bool:
        """Switch active Whisper model (tiny, base, small, medium, large-v3, large-v3-turbo, distil-large-v3)."""
        self.current_model_name = model_name
        if self._WhisperModel is not None:
            self.engine = f"faster-whisper [{self.current_model_name}]"
        return True

    def _load_fw(self, model_name: Optional[str] = None):
        target = model_name or self.current_model_name
        if self._WhisperModel is None:
            return None
        if target not in self._fw_models:
            # Cap cache size to max 2 models to prevent unbounded RAM growth
            while len(self._fw_models) >= 2:
                oldest_key = next((k for k in self._fw_models if k != target), next(iter(self._fw_models)))
                del self._fw_models[oldest_key]

            # Map friendly names to faster-whisper identifiers
            mapped = target
            if "large-v3-turbo" in target.lower():
                mapped = "deepdml/faster-whisper-large-v3-turbo-ct2"
            elif "distil-large-v3" in target.lower():
                mapped = "Systran/faster-distil-whisper-large-v3"
            elif "large-v3" in target.lower():
                mapped = "large-v3"
            elif "medium" in target.lower():
                mapped = "medium"
            elif "small" in target.lower():
                mapped = "small"
            elif "tiny" in target.lower():
                mapped = "tiny"
            else:
                mapped = "base"

            try:
                self._fw_models[target] = self._WhisperModel(mapped, device="cpu", compute_type="int8")
            except Exception:
                # Fallback to standard base if requested model fails to download/load
                if target != "base":
                    return self._load_fw("base")
                raise
        return self._fw_models[target]

    def transcribe_audio_bytes(self, audio_bytes: bytes, filename: str = "audio.wav", model_name: Optional[str] = None) -> Dict[str, Any]:
        if not audio_bytes or len(audio_bytes) < 44:
            return {"text": "", "confidence": 0.0, "language": "en"}

        temp_path = None
        wav_path = None
        try:
            suffix = os.path.splitext(filename)[1] or ".wav"
            with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tf:
                tf.write(audio_bytes)
                temp_path = tf.name

            # Convert to 16kHz mono PCM WAV via ffmpeg for optimal Whisper accuracy
            wav_path = temp_path + ".wav"
            try:
                subprocess.run(
                    ["ffmpeg", "-y", "-i", temp_path, "-ar", "16000", "-ac", "1", wav_path],
                    stdout=subprocess.DEVNULL,
                    stderr=subprocess.DEVNULL,
                    check=True,
                    timeout=10
                )
            except Exception:
                # If ffmpeg is absent or fails, use raw temp_path directly
                wav_path = temp_path

            # Offline Whisper path (preferred)
            if self._WhisperModel is not None:
                model = self._load_fw(model_name)
                segments, info = model.transcribe(wav_path, beam_size=1)
                text = " ".join(seg.text.strip() for seg in segments).strip()
                return {
                    "text": text,
                    "confidence": float(getattr(info, "language_probability", 1.0) or 1.0),
                    "language": getattr(info, "language", "en") or "en",
                    "engine": f"faster-whisper ({self.current_model_name})"
                }

            # Online speech_recognition fallback
            if self._recognizer is not None and self._sr is not None:
                with self._sr.AudioFile(wav_path) as source:
                    audio_data = self._recognizer.record(source)
                try:
                    text = self._recognizer.recognize_google(audio_data)
                    return {"text": text, "confidence": 0.9, "language": "en", "engine": "google-fallback"}
                except self._sr.UnknownValueError:
                    return {"text": "", "confidence": 0.0, "language": "en"}
                except self._sr.RequestError:
                    return {"text": "", "confidence": 0.0, "language": "en", "error": "network_unavailable"}

            return {"text": "", "confidence": 0.0, "language": "en", "error": "no_stt_engine"}

        except Exception as e:
            return {"text": "", "confidence": 0.0, "language": "en", "error": str(e)}
        finally:
            for p in (temp_path, wav_path):
                if p and os.path.exists(p):
                    try:
                        os.remove(p)
                    except Exception:
                        pass


stt_service = STTService()
