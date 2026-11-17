import io
import os
import tempfile
import wave
from typing import Dict, Any
import speech_recognition as sr

class STTService:
    def __init__(self):
        self.recognizer = sr.Recognizer()

    def transcribe_audio_bytes(self, audio_bytes: bytes, filename: str = "audio.wav") -> Dict[str, Any]:
        """
        Transcribes audio data bytes to text using SpeechRecognition.
        Supports standard PCM/WAV headers.
        """
        if not audio_bytes or len(audio_bytes) < 44:
            return {"text": "", "confidence": 0.0, "language": "en"}

        temp_path = None
        try:
            # Write to temporary file for audio decoding
            suffix = os.path.splitext(filename)[1] or ".wav"
            with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tf:
                tf.write(audio_bytes)
                temp_path = tf.name

            with sr.AudioFile(temp_path) as source:
                # Record the audio data from the file
                audio_data = self.recognizer.record(source)

            # Attempt transcription
            try:
                # Uses free web recognition API
                text = self.recognizer.recognize_google(audio_data)
                return {
                    "text": text,
                    "confidence": 0.95,
                    "language": "en"
                }
            except sr.UnknownValueError:
                return {
                    "text": "",
                    "confidence": 0.0,
                    "language": "en"
                }
            except sr.RequestError as e:
                # If network is unavailable or request fails
                return {
                    "text": "Could not contact speech recognition service (offline mode).",
                    "confidence": 0.0,
                    "language": "en"
                }

        except Exception as e:
            return {
                "text": f"Audio processing error: {str(e)}",
                "confidence": 0.0,
                "language": "en"
            }
        finally:
            if temp_path and os.path.exists(temp_path):
                try:
                    os.remove(temp_path)
                except Exception:
                    pass

stt_service = STTService()
