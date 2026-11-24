import { Buffer } from "buffer";
import { AndroidAssistant, type EnrollmentSampleResult, type VerificationResult } from "@/src/services/android/AndroidAssistant";

export const CALIBRATION_PROMPTS = [
  "Hey Assistant, what's on my schedule today?",
  "Hey Assistant, send a message to Zoro.",
  "Hey Assistant, turn on the flashlight and check the battery.",
  "Hey Assistant, remind me to check the project report at 6.",
];

export interface AudioPayload {
  base64Audio: string;
  isRawPcm?: boolean;
  format?: string;
}

export interface LastVerificationState {
  verified: boolean;
  timestamp: number;
}

let lastVerification: LastVerificationState | null = null;
const DEFAULT_VERIFICATION_TTL_MS = 60000; // 60s validity window for voice sessions

/**
 * Detects whether an audio base64 payload is a compressed audio container (.m4a, .webm, ogg, mp3, riff)
 * rather than raw headerless 16-bit PCM samples.
 */
export function isCompressedAudioContainer(base64Audio: string): boolean {
  if (!base64Audio || typeof base64Audio !== "string") return false;
  try {
    const headerSlice = base64Audio.slice(0, 64);
    const buf = Buffer.from(headerSlice, "base64");
    if (buf.length < 4) return false;

    // WebM / Matroska EBML: 1A 45 DF A3
    if (buf[0] === 0x1A && buf[1] === 0x45 && buf[2] === 0xDF && buf[3] === 0xA3) {
      return true;
    }

    // M4A / MP4: offset 4 is 'f', 't', 'y', 'p' (0x66 0x74 0x79 0x70)
    if (buf.length >= 8 && buf[4] === 0x66 && buf[5] === 0x74 && buf[6] === 0x79 && buf[7] === 0x70) {
      return true;
    }

    // RIFF container header: "RIFF" (52 49 46 46)
    if (buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46) {
      return true;
    }

    // Ogg stream: "OggS" (4F 67 67 53)
    if (buf[0] === 0x4F && buf[1] === 0x67 && buf[2] === 0x67 && buf[3] === 0x53) {
      return true;
    }

    // ID3 (MP3): "ID3" (49 44 33)
    if (buf[0] === 0x49 && buf[1] === 0x44 && buf[2] === 0x33) {
      return true;
    }

    return false;
  } catch {
    return false;
  }
}

export const VoiceSecurityService = {
  async isEnrolled(): Promise<boolean> {
    return await AndroidAssistant.isVoiceEnrolled();
  },

  async startEnrollment(): Promise<{ ok: boolean; message: string }> {
    return await AndroidAssistant.startVoiceEnrollment();
  },

  async addSample(
    audio: string | AudioPayload,
    isRawPcmFlag: boolean = true
  ): Promise<EnrollmentSampleResult> {
    const base64Audio = typeof audio === "string" ? audio : audio.base64Audio;
    const isRaw = typeof audio === "string" ? isRawPcmFlag : (audio.isRawPcm ?? isRawPcmFlag);

    if (!isRaw || isCompressedAudioContainer(base64Audio)) {
      return {
        success: false,
        sampleIndex: 0,
        snrDb: 0,
        durationSec: 0,
        message: "Rejected: Audio is in a compressed container (.m4a/.webm). Raw 16 kHz 16-bit mono PCM is required.",
      };
    }

    return await AndroidAssistant.addEnrollmentSample(base64Audio);
  },

  async finalizeEnrollment(): Promise<{ success: boolean; message: string }> {
    return await AndroidAssistant.finalizeEnrollment();
  },

  async deleteProfile(): Promise<boolean> {
    lastVerification = null;
    return await AndroidAssistant.deleteVoiceProfile();
  },

  async verifySpeaker(
    audio: string | AudioPayload,
    threshold: number = 0.75,
    checkAntiSpoof: boolean = true,
    isRawPcmFlag: boolean = true
  ): Promise<VerificationResult> {
    const base64Audio = typeof audio === "string" ? audio : audio.base64Audio;
    const isRaw = typeof audio === "string" ? isRawPcmFlag : (audio.isRawPcm ?? isRawPcmFlag);

    if (!isRaw || isCompressedAudioContainer(base64Audio)) {
      const result: VerificationResult = {
        verified: false,
        score: 0,
        threshold,
        snrDb: 0,
        isSpoofOrReplay: false,
        message: "Speaker verification rejected: Audio is in a compressed container (.m4a/.webm). Raw 16 kHz 16-bit mono PCM is required.",
      };
      lastVerification = { verified: false, timestamp: Date.now() };
      return result;
    }

    const res = await AndroidAssistant.verifySpeaker(base64Audio, threshold, checkAntiSpoof);
    lastVerification = { verified: res.verified, timestamp: Date.now() };
    return res;
  },

  /**
   * Returns true if speaker verification was performed and passed within the TTL window.
   */
  isLastVoiceVerified(maxAgeMs: number = DEFAULT_VERIFICATION_TTL_MS): boolean {
    if (!lastVerification) return false;
    if (Date.now() - lastVerification.timestamp > maxAgeMs) return false;
    return lastVerification.verified;
  },

  /**
   * Explicitly sets the speaker verification state (e.g. from wake word speaker verification or test flow).
   */
  setLastVerification(verified: boolean): void {
    lastVerification = { verified, timestamp: Date.now() };
  },

  /**
   * Resets the cached speaker verification state.
   */
  clearLastVerification(): void {
    lastVerification = null;
  },

  /**
   * Inspects current cached verification state.
   */
  getLastVerification(): LastVerificationState | null {
    return lastVerification;
  },
};

export default VoiceSecurityService;
