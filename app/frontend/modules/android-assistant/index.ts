import { Platform } from "react-native";
import { requireNativeModule, EventEmitter } from "expo-modules-core";

export interface Subscription {
  remove: () => void;
}

export interface InstalledApp {
  name: string;
  packageName: string;
}

export interface ContactRecord {
  id: string;
  name: string;
  number: string;
  type: string;
}

export interface BatteryStatus {
  success: boolean;
  percentage: number;
  isCharging: boolean;
  message: string;
}

export interface VolumeInfo {
  success: boolean;
  stream: string;
  current: number;
  max: number;
  percentage: number;
  message: string;
}

export interface AudioRoutingInfo {
  success: boolean;
  mode: string;
  isBluetoothConnected: boolean;
  isDrivingLikely: boolean;
  message: string;
}

export interface EnrollmentSampleResult {
  success: boolean;
  sampleIndex?: number;
  snrDb?: number;
  durationSec?: number;
  reason?: string;
  message?: string;
}

export interface VerificationResult {
  verified: boolean;
  score: number;
  threshold: number;
  snrDb: number;
  isSpoofOrReplay: boolean;
  message: string;
}

export interface WakeWordResult {
  ok: boolean;
  status: string;
  message: string;
  phrase?: string;
  sensitivity?: string;
}

export interface AssistantNotification {
  id: string;
  packageName: string;
  appName: string;
  title: string;
  text: string;
  timestamp: number;
}

export interface OperationResult {
  success: boolean;
  message: string;
  [key: string]: any;
}

// Load native module defensively
let nativeModule: any = null;
let eventEmitter: EventEmitter | null = null;

if (Platform.OS === "android") {
  try {
    nativeModule = requireNativeModule("AndroidAssistant");
    eventEmitter = new EventEmitter(nativeModule);
  } catch (e) {
    console.warn("[AndroidAssistant] Native module not linked or running in unsupported environment:", e);
  }
}

export const AndroidAssistant = {
  isAvailable(): boolean {
    return Platform.OS === "android" && nativeModule !== null;
  },

  async getInstalledApps(): Promise<InstalledApp[]> {
    if (this.isAvailable()) {
      return await nativeModule.getInstalledApps();
    }
    return [
      { name: "Camera", packageName: "com.android.camera" },
      { name: "Chrome", packageName: "com.android.chrome" },
      { name: "Settings", packageName: "com.android.settings" },
      { name: "WhatsApp", packageName: "com.whatsapp" },
      { name: "YouTube", packageName: "com.google.android.youtube" },
    ];
  },

  async openApp(packageName: string): Promise<boolean> {
    if (this.isAvailable()) {
      return await nativeModule.openApp(packageName);
    }
    return false;
  },

  async openAppByName(name: string): Promise<OperationResult> {
    if (this.isAvailable()) {
      return await nativeModule.openAppByName(name);
    }
    return {
      success: true,
      simulated: true,
      message: `[Simulated] Opening app "${name}".`,
    };
  },

  async openSettings(settingType: string = "main"): Promise<boolean> {
    if (this.isAvailable()) {
      return await nativeModule.openSettings(settingType);
    }
    return false;
  },

  async navigateHome(): Promise<boolean> {
    if (this.isAvailable()) {
      return await nativeModule.navigateHome();
    }
    return false;
  },

  async hasContactsPermission(): Promise<boolean> {
    if (this.isAvailable()) {
      return await nativeModule.hasContactsPermission();
    }
    return false;
  },

  async requestContactsPermission(): Promise<boolean> {
    if (this.isAvailable() && nativeModule.requestContactsPermission) {
      return await nativeModule.requestContactsPermission();
    }
    return false;
  },

  async searchContacts(query: string): Promise<ContactRecord[]> {
    if (this.isAvailable()) {
      return await nativeModule.searchContacts(query);
    }
    return [];
  },

  async hasDirectCallPermission(): Promise<boolean> {
    if (this.isAvailable()) {
      return await nativeModule.hasDirectCallPermission();
    }
    return false;
  },

  async requestCallPermission(): Promise<boolean> {
    if (this.isAvailable() && nativeModule.requestCallPermission) {
      return await nativeModule.requestCallPermission();
    }
    return false;
  },

  async dial(number: string): Promise<OperationResult> {
    if (this.isAvailable()) {
      return await nativeModule.dial(number);
    }
    return {
      success: true,
      simulated: true,
      mode: "dialer",
      message: `[Simulated] Opened dialer with number: ${number}`,
    };
  },

  async call(number: string, fallbackToDial: boolean = true): Promise<OperationResult> {
    if (this.isAvailable()) {
      return await nativeModule.call(number, fallbackToDial);
    }
    return {
      success: true,
      simulated: true,
      mode: "direct",
      message: `[Simulated] Calling ${number} directly.`,
    };
  },

  async openWhatsApp(number: string | null, message: string): Promise<OperationResult> {
    if (this.isAvailable()) {
      return await nativeModule.openWhatsApp(number, message);
    }
    return {
      success: true,
      simulated: true,
      message: `[Simulated] Prepared WhatsApp message to ${number || "selected contact"}: "${message}".`,
    };
  },

  async openSms(number: string | null, message: string): Promise<OperationResult> {
    if (this.isAvailable()) {
      return await nativeModule.openSms(number, message);
    }
    return {
      success: true,
      simulated: true,
      message: `[Simulated] Prepared SMS to ${number || "selected contact"}: "${message}".`,
    };
  },

  async setFlashlight(enabled: boolean): Promise<OperationResult> {
    if (this.isAvailable()) {
      return await nativeModule.setFlashlight(enabled);
    }
    return {
      success: true,
      simulated: true,
      message: `[Simulated] Flashlight turned ${enabled ? "on" : "off"}.`,
    };
  },

  async toggleFlashlight(): Promise<OperationResult> {
    if (this.isAvailable()) {
      return await nativeModule.toggleFlashlight();
    }
    return {
      success: true,
      simulated: true,
      message: "[Simulated] Toggled flashlight state.",
    };
  },

  async getBatteryStatus(): Promise<BatteryStatus> {
    if (this.isAvailable()) {
      return await nativeModule.getBatteryStatus();
    }
    return {
      success: true,
      percentage: 85,
      isCharging: false,
      message: "[Simulated] Battery is at 85% and discharging.",
    };
  },

  async setVolume(stream: string, percentage: number): Promise<OperationResult> {
    if (this.isAvailable()) {
      return await nativeModule.setVolume(stream, percentage);
    }
    return {
      success: true,
      simulated: true,
      message: `[Simulated] Set ${stream} volume to ${percentage}%.`,
    };
  },

  async getVolume(stream: string): Promise<VolumeInfo> {
    if (this.isAvailable()) {
      return await nativeModule.getVolume(stream);
    }
    return {
      success: true,
      stream,
      current: 7,
      max: 15,
      percentage: 47,
      message: `[Simulated] ${stream} volume is at 47%.`,
    };
  },

  async setAlarm(hour: number, minute: number, message: string): Promise<OperationResult> {
    if (this.isAvailable()) {
      return await nativeModule.setAlarm(hour, minute, message);
    }
    const timeFormatted = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
    return {
      success: true,
      simulated: true,
      message: `[Simulated] Alarm set for ${timeFormatted}: "${message}".`,
    };
  },

  async setTimer(seconds: number, message: string): Promise<OperationResult> {
    if (this.isAvailable()) {
      return await nativeModule.setTimer(seconds, message);
    }
    return {
      success: true,
      simulated: true,
      message: `[Simulated] Timer set for ${seconds} seconds: "${message}".`,
    };
  },

  async getAudioRoutingEnvironment(): Promise<AudioRoutingInfo> {
    if (this.isAvailable()) {
      return await nativeModule.getAudioRoutingEnvironment();
    }
    return {
      success: true,
      mode: "handset",
      isBluetoothConnected: false,
      isDrivingLikely: false,
      message: "[Simulated] Audio routing: handset",
    };
  },

  // Voice Security & Biometrics
  async isVoiceEnrolled(): Promise<boolean> {
    if (this.isAvailable()) {
      return await nativeModule.isVoiceEnrolled();
    }
    return false;
  },

  async deleteVoiceProfile(): Promise<boolean> {
    if (this.isAvailable()) {
      return await nativeModule.deleteVoiceProfile();
    }
    return true;
  },

  async startVoiceEnrollment(): Promise<{ ok: boolean; message: string }> {
    if (this.isAvailable()) {
      return await nativeModule.startVoiceEnrollment();
    }
    return { ok: true, message: "[Simulated] Voice enrollment session started." };
  },

  async addEnrollmentSample(audioBase64: string): Promise<EnrollmentSampleResult> {
    if (this.isAvailable()) {
      return await nativeModule.addEnrollmentSample(audioBase64);
    }
    return {
      success: true,
      sampleIndex: 1,
      snrDb: 24.5,
      durationSec: 2.3,
      message: "[Simulated] Voice sample recorded successfully.",
    };
  },

  async finalizeEnrollment(): Promise<{ success: boolean; message: string }> {
    if (this.isAvailable()) {
      return await nativeModule.finalizeEnrollment();
    }
    return {
      success: true,
      message: "[Simulated] Owner voice profile securely encrypted in Android Keystore.",
    };
  },

  async verifySpeaker(audioBase64: string, threshold: number = 0.75, checkAntiSpoof: boolean = true): Promise<VerificationResult> {
    if (this.isAvailable()) {
      return await nativeModule.verifySpeaker(audioBase64, threshold, checkAntiSpoof);
    }
    return {
      verified: true,
      score: 0.88,
      threshold,
      snrDb: 22.0,
      isSpoofOrReplay: false,
      message: "[Simulated] Voice authorized (Confidence: 88.0%).",
    };
  },

  // Wake Word
  async getWakeWordStatus(): Promise<string> {
    if (this.isAvailable()) {
      return await nativeModule.getWakeWordStatus();
    }
    return "stopped";
  },

  onWakeWordDetected(callback: (event: { phrase: string; timestamp: number; score?: number }) => void): Subscription | null {
    if (eventEmitter) {
      return (eventEmitter as any).addListener("onWakeWordDetected", callback);
    }
    return null;
  },

  async startWakeWord(phrase: string, sensitivity: string): Promise<WakeWordResult> {
    if (this.isAvailable()) {
      return await nativeModule.startWakeWord(phrase, sensitivity);
    }
    return {
      ok: true,
      status: "listening",
      phrase,
      sensitivity,
      message: `[Simulated] Wake-word detector listening for "${phrase}".`,
    };
  },

  async stopWakeWord(): Promise<WakeWordResult> {
    if (this.isAvailable()) {
      return await nativeModule.stopWakeWord();
    }
    return {
      ok: true,
      status: "stopped",
      message: "[Simulated] Wake-word detector stopped.",
    };
  },

  // Foreground Service & System Assistant Integration
  async startForegroundListening(phrase: string, sensitivity: string): Promise<{ ok: boolean; message: string }> {
    if (this.isAvailable()) {
      return await nativeModule.startForegroundListening(phrase, sensitivity);
    }
    return { ok: true, message: "[Simulated] Foreground listening service started with notification." };
  },

  async stopForegroundListening(): Promise<{ ok: boolean; message: string }> {
    if (this.isAvailable()) {
      return await nativeModule.stopForegroundListening();
    }
    return { ok: true, message: "[Simulated] Foreground listening service stopped." };
  },

  async isForegroundServiceRunning(): Promise<boolean> {
    if (this.isAvailable()) {
      return await nativeModule.isForegroundServiceRunning();
    }
    return false;
  },

  async isDefaultAssistant(): Promise<boolean> {
    if (this.isAvailable() && nativeModule.isDefaultAssistant) {
      return await nativeModule.isDefaultAssistant();
    }
    return false;
  },

  async requestDefaultAssistantRole(): Promise<{ ok: boolean; launchedRoleDialog?: boolean; error?: string }> {
    if (this.isAvailable() && nativeModule.requestDefaultAssistantRole) {
      return await nativeModule.requestDefaultAssistantRole();
    }
    return { ok: false, error: "Native assistant role request unavailable." };
  },

  async openDefaultAssistantSettings(): Promise<boolean> {
    if (this.isAvailable()) {
      return await nativeModule.openDefaultAssistantSettings();
    }
    return false;
  },

  // System Speech Recognition
  async isSystemSpeechAvailable(): Promise<boolean> {
    if (this.isAvailable() && nativeModule.isSystemSpeechAvailable) {
      return await nativeModule.isSystemSpeechAvailable();
    }
    return false;
  },

  async startSystemSpeech(language?: string): Promise<{ ok: boolean }> {
    if (this.isAvailable() && nativeModule.startSystemSpeech) {
      return await nativeModule.startSystemSpeech(language);
    }
    return { ok: false };
  },

  async stopSystemSpeech(): Promise<{ ok: boolean }> {
    if (this.isAvailable() && nativeModule.stopSystemSpeech) {
      return await nativeModule.stopSystemSpeech();
    }
    return { ok: false };
  },

  async cancelSystemSpeech(): Promise<{ ok: boolean }> {
    if (this.isAvailable() && nativeModule.cancelSystemSpeech) {
      return await nativeModule.cancelSystemSpeech();
    }
    return { ok: false };
  },

  onSpeechPartial(callback: (text: string) => void): Subscription | null {
    if (eventEmitter) {
      return (eventEmitter as any).addListener("onSpeechPartialResult", (event: { text: string }) => {
        callback(event.text);
      });
    }
    return null;
  },

  onSpeechFinal(callback: (text: string) => void): Subscription | null {
    if (eventEmitter) {
      return (eventEmitter as any).addListener("onSpeechFinalResult", (event: { text: string }) => {
        callback(event.text);
      });
    }
    return null;
  },

  onSpeechError(callback: (err: string) => void): Subscription | null {
    if (eventEmitter) {
      return (eventEmitter as any).addListener("onSpeechError", (event: { error: string }) => {
        callback(event.error);
      });
    }
    return null;
  },

  // Notification Listener Service
  async hasNotificationAccess(): Promise<boolean> {
    if (this.isAvailable()) {
      return await nativeModule.hasNotificationAccess();
    }
    return false;
  },

  async openNotificationAccessSettings(): Promise<boolean> {
    if (this.isAvailable()) {
      return await nativeModule.openNotificationAccessSettings();
    }
    return false;
  },

  async getRecentNotifications(limit = 10): Promise<AssistantNotification[]> {
    if (this.isAvailable()) {
      return await nativeModule.getRecentNotifications(limit);
    }
    return [];
  },

  async clearRecentNotifications(): Promise<boolean> {
    if (this.isAvailable()) {
      return await nativeModule.clearRecentNotifications();
    }
    return true;
  },
};

export default AndroidAssistant;
