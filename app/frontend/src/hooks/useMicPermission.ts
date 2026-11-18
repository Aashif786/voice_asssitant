import { useCallback, useEffect, useState } from "react";

import type { MicPermission } from "@/src/services/audio/AudioCapture.interface";
import { audioCapture } from "@/src/services/audio/ExpoAudioCapture";

export function useMicPermission() {
  const [perm, setPerm] = useState<MicPermission | null>(null);
  const refresh = useCallback(async () => {
    const p = await audioCapture.getPermission();
    setPerm(p);
    return p;
  }, []);
  const request = useCallback(async () => {
    const p = await audioCapture.requestPermission();
    setPerm(p);
    return p;
  }, []);
  useEffect(() => {
    let active = true;
    void audioCapture.getPermission().then((p) => {
      if (active) setPerm(p);
    });
    return () => {
      active = false;
    };
  }, []);
  return { perm, refresh, request };
}
