import { useCallback, useEffect, useState } from "react";

import type { MicPermission } from "@/src/services/audio/AudioCapture.interface";
import { audioCapture } from "@/src/services/audio/ExpoAudioCapture";

export function useMicPermission() {
  const [perm, setPerm] = useState<MicPermission | null>(null);
  const refresh = useCallback(async () => setPerm(await audioCapture.getPermission()), []);
  const request = useCallback(async () => {
    const p = await audioCapture.requestPermission();
    setPerm(p);
    return p;
  }, []);
  useEffect(() => { refresh(); }, [refresh]);
  return { perm, refresh, request };
}
