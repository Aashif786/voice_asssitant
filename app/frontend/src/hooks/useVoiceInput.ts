import { useCallback, useRef, useState } from "react";

import { audioCapture } from "@/src/services/audio/ExpoAudioCapture";
import { speechModel } from "@/src/services/models/ModelService";
import { nativeInference } from "@/src/services/native";
import { speechRecognition } from "@/src/services/voice";

export type VoiceStatus = "idle" | "preparing" | "listening" | "error" | "unavailable";

/**
 * Drives the push-to-talk flow: permission -> on-device Whisper (if available)
 * or companion backend STT -> live transcription -> final text.
 */
export function useVoiceInput() {
  const [status, setStatus] = useState<VoiceStatus>("idle");
  const [partial, setPartial] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [modelProgress, setModelProgress] = useState<number | null>(null);
  const latest = useRef("");

  const start = useCallback(async () => {
    setError(null);
    setPartial("");
    latest.current = "";

    if (!speechRecognition.isAvailable()) {
      setStatus("unavailable");
      setError(speechRecognition.reason() ?? "Speech recognition is unavailable.");
      return;
    }

    const perm = await audioCapture.requestPermission();
    if (!perm.granted) {
      setStatus("error");
      setError(perm.canAskAgain ? "Microphone permission is needed to talk." : "Microphone is blocked. Enable it in system settings.");
      return;
    }

    // Only on-device Whisper needs to download the speech model
    if (nativeInference.whisperAvailable) {
      if (!(await speechModel.isInstalled())) {
        setStatus("preparing");
        setModelProgress(0.01);
        try {
          await speechModel.download((p) => setModelProgress(p));
        } catch {
          setStatus("error");
          setError("Couldn't download the speech model. Check your connection and try again.");
          setModelProgress(null);
          return;
        }
        setModelProgress(null);
      }
      speechRecognition.setModel(speechModel.path);
    }

    setStatus("listening");
    const res = await speechRecognition.start("en", (e) => {
      if (e.text) {
        latest.current = e.text;
        setPartial(e.text);
      }
    });
    if (!res.ok) {
      setStatus("error");
      setError(res.reason ?? "Could not start listening.");
    }
  }, []);

  /** Stop listening and return the final transcript. */
  const stop = useCallback(async (): Promise<string> => {
    await speechRecognition.stop();
    const text = latest.current.trim();
    setStatus("idle");
    setPartial("");
    return text;
  }, []);

  const cancel = useCallback(async () => {
    await speechRecognition.cancel();
    latest.current = "";
    setPartial("");
    setModelProgress(null);
    setStatus("idle");
    setError(null);
  }, []);

  return { status, partial, error, modelProgress, start, stop, cancel };
}
