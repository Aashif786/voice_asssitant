import { AndroidAssistant, type EnrollmentSampleResult, type VerificationResult } from "@/src/services/android/AndroidAssistant";

export const CALIBRATION_PROMPTS = [
  "Hey Assistant, what's on my schedule today?",
  "Hey Assistant, send a message to Zoro.",
  "Hey Assistant, turn on the flashlight and check the battery.",
  "Hey Assistant, remind me to check the project report at 6.",
];

export const VoiceSecurityService = {
  async isEnrolled(): Promise<boolean> {
    return await AndroidAssistant.isVoiceEnrolled();
  },

  async startEnrollment(): Promise<{ ok: boolean; message: string }> {
    return await AndroidAssistant.startVoiceEnrollment();
  },

  async addSample(audioBase64: string): Promise<EnrollmentSampleResult> {
    return await AndroidAssistant.addEnrollmentSample(audioBase64);
  },

  async finalizeEnrollment(): Promise<{ success: boolean; message: string }> {
    return await AndroidAssistant.finalizeEnrollment();
  },

  async deleteProfile(): Promise<boolean> {
    return await AndroidAssistant.deleteVoiceProfile();
  },

  async verifySpeaker(
    audioBase64: string,
    threshold: number = 0.75,
    checkAntiSpoof: boolean = true
  ): Promise<VerificationResult> {
    return await AndroidAssistant.verifySpeaker(audioBase64, threshold, checkAntiSpoof);
  },
};

export default VoiceSecurityService;
