import { getRecordingPermissionsAsync, requestRecordingPermissionsAsync, type PermissionResponse } from "expo-audio";

import type { AudioCaptureEngine, MicPermission } from "./AudioCapture.interface";

const map = (r: PermissionResponse): MicPermission => ({
  granted: r.granted,
  canAskAgain: r.canAskAgain,
  status: r.status as MicPermission["status"],
});

const unknown: MicPermission = { granted: false, canAskAgain: true, status: "undetermined" };

export const audioCapture: AudioCaptureEngine = {
  async getPermission() {
    try { return map(await getRecordingPermissionsAsync()); } catch { return unknown; }
  },
  async requestPermission() {
    try { return map(await requestRecordingPermissionsAsync()); } catch { return { ...unknown, status: "denied" }; }
  },
};
