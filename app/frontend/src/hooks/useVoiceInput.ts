import { useCallback, useEffect, useRef, useState } from "react";

import { audioCapture } from "@/src/services/audio/ExpoAudioCapture";
import { speechRecognition } from "@/src/services/voice";
import { useSettings } from "@/src/store/settings";

export type VoiceStatus = "idle" | "requesting_permission" | "preparing" | "listening" | "processing" | "error" | "unavailable";

/**
 * Robust, unified voice input pipeline for both VoiceOrb and Composer mic button:
 * - Independent model checking (zero auto-downloading)
 * - Safe permission requesting & revocation handling
 * - Live partial transcription display
 * - Silence VAD auto-commit (1.8s)
 * - 20s listening safety timeout (prevents stuck mic sessions)
 * - Guaranteed audio resource release
 */
export function useVoiceInput(onAutoCommit?: (text: string) => void) {
  const { settings } = useSettings();
  const [status, setStatus] = useState<VoiceStatus>("idle");
  const [partial, setPartial] = useState("");
  const [error, setError] = useState<string | null>(null);

  const latest = useRef("");
  const isListeningRef = useRef(false);
  const silenceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const maxSessionTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoCommitRef = useRef(onAutoCommit);

  useEffect(() => {
    autoCommitRef.current = onAutoCommit;
  }, [onAutoCommit]);

  const clearTimers = () => {
    if (silenceTimer.current) {
      clearTimeout(silenceTimer.current);
      silenceTimer.current = null;
    }
    if (maxSessionTimer.current) {
      clearTimeout(maxSessionTimer.current);
      maxSessionTimer.current = null;
    }
  };

  /** Stop listening and return the final transcript. */
  const stop = useCallback(async (): Promise<string> => {
    clearTimers();
    if (!isListeningRef.current) return "";
    isListeningRef.current = false;
    setStatus("processing");

    try {
      await speechRecognition.stop();
    } catch {
      /* ignore */
    }

    const text = latest.current.trim();
    setStatus("idle");
    setPartial("");
    return text;
  }, []);

  const cancel = useCallback(async () => {
    clearTimers();
    isListeningRef.current = false;
    try {
      await speechRecognition.cancel();
    } catch {
      /* ignore */
    }
    latest.current = "";
    setPartial("");
    setStatus("idle");
    setError(null);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      clearTimers();
      if (isListeningRef.current) {
        isListeningRef.current = false;
        void speechRecognition.cancel();
      }
    };
  }, []);

  const start = useCallback(async () => {
    clearTimers();
    setError(null);
    setPartial("");
    latest.current = "";

    // 1. Verify STT model availability (never auto-download)
    if (!speechRecognition.isAvailable()) {
      setStatus("unavailable");
      setError(speechRecognition.reason() ?? "Speech recognition is not configured. Please select or download an STT model in the Models tab.");
      return;
    }

    // 2. Request mic permission
    setStatus("requesting_permission");
    let perm: any;
    try {
      perm = await audioCapture.requestPermission();
    } catch (e: any) {
      setStatus("error");
      setError(e?.message ?? "Microphone access failed.");
      return;
    }

    if (!perm.granted) {
      setStatus("error");
      setError(
        perm.canAskAgain
          ? "Microphone permission is needed to talk."
          : "Microphone permission is permanently denied. Please enable it in system settings."
      );
      return;
    }

    // 3. Begin listening
    setStatus("listening");
    isListeningRef.current = true;

    // Safety timeout: auto-stop after 20s if user speaks continuously without stopping
    maxSessionTimer.current = setTimeout(() => {
      if (isListeningRef.current) {
        void stop().then((t) => {
          if (t && autoCommitRef.current) autoCommitRef.current(t);
        });
      }
    }, 20000);

    const lang = settings?.language?.toLowerCase().startsWith("en") ? "en" : (settings?.language || "en");
    const res = await speechRecognition.start(lang, (e) => {
      if (!isListeningRef.current) return;

      if (e.text) {
        latest.current = e.text;
        setPartial(e.text);

        if (silenceTimer.current) {
          clearTimeout(silenceTimer.current);
          silenceTimer.current = null;
        }

        if (e.isFinal) {
          if (autoCommitRef.current) {
            void stop().then((t) => {
              if (t && autoCommitRef.current) autoCommitRef.current(t);
            });
          }
        } else if (autoCommitRef.current) {
          // Commit automatically after 1.8 seconds of silence
          silenceTimer.current = setTimeout(() => {
            if (isListeningRef.current) {
              void stop().then((t) => {
                if (t && autoCommitRef.current) autoCommitRef.current(t);
              });
            }
          }, 1800);
        }
      }
    });

    if (!res.ok) {
      clearTimers();
      isListeningRef.current = false;
      setStatus("error");
      setError(res.reason ?? "Could not start microphone listening.");
    }
  }, [stop, settings?.language]);

  return {
    status,
    partial,
    error,
    modelProgress: null,
    start,
    stop,
    cancel,
  };
}
