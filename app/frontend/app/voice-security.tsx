import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { KeyboardAwareScrollView } from "@/src/components/common/SafeKeyboard";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Icon } from "@/src/components/common/Icon";
import { OptionSheet, type OptionPicker } from "@/src/components/common/OptionSheet";
import { Row, Section } from "@/src/components/common/Row";
import { ScreenHeader } from "@/src/components/common/ScreenHeader";
import { Sheet, SheetButton } from "@/src/components/common/Sheet";
import { CALIBRATION_PROMPTS, VoiceSecurityService } from "@/src/services/voice/VoiceSecurityService";
import { RealVoiceCaptureService } from "@/src/services/audio/RealVoiceCaptureService";
import { useSettings } from "@/src/store/settings";
import { makeStyles, useTheme } from "@/src/theme";

export default function VoiceSecurityScreen() {
  const s = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { settings, update } = useSettings();

  const [enrolling, setEnrolling] = useState(false);
  const [step, setStep] = useState(0);
  const [recording, setRecording] = useState(false);
  const [testResult, setTestResult] = useState<{ score: number; verified: boolean; message: string } | null>(null);
  const [deleteSheet, setDeleteSheet] = useState(false);
  const [picker, setPicker] = useState<OptionPicker<any> | null>(null);

  const isEnrolled = settings.voiceEnrolled;

  const startEnrollmentFlow = async () => {
    await VoiceSecurityService.startEnrollment();
    setStep(0);
    setEnrolling(true);
    setTestResult(null);
  };

  const handleRecordSample = async () => {
    setRecording(true);
    const startRes = await RealVoiceCaptureService.start();
    if (!startRes.ok) {
      setRecording(false);
      return;
    }

    setTimeout(async () => {
      const audioResult = await RealVoiceCaptureService.stop();
      setRecording(false);
      if (!audioResult?.base64Audio) return;

      const res = await VoiceSecurityService.addSample(audioResult.base64Audio);
      if (res.success) {
        if (step + 1 < CALIBRATION_PROMPTS.length) {
          setStep(step + 1);
        } else {
          const fin = await VoiceSecurityService.finalizeEnrollment();
          if (fin.success) {
            update({ voiceEnrolled: true });
            setEnrolling(false);
          }
        }
      }
    }, 3000);
  };

  const handleTestVoice = async () => {
    setRecording(true);
    const startRes = await RealVoiceCaptureService.start();
    if (!startRes.ok) {
      setRecording(false);
      return;
    }

    setTimeout(async () => {
      const audioResult = await RealVoiceCaptureService.stop();
      setRecording(false);
      if (!audioResult?.base64Audio) return;

      const res = await VoiceSecurityService.verifySpeaker(
        audioResult.base64Audio,
        settings.voiceVerificationThreshold,
        settings.antiSpoofingEnabled
      );
      setTestResult({
        score: res.score,
        verified: res.verified,
        message: res.message,
      });
    }, 2500);
  };

  const handleDeleteProfile = async () => {
    await VoiceSecurityService.deleteProfile();
    update({ voiceEnrolled: false });
    setDeleteSheet(false);
    setEnrolling(false);
    setTestResult(null);
  };

  const thresholdLabel =
    settings.voiceVerificationThreshold <= 0.65
      ? "Relaxed (0.65)"
      : settings.voiceVerificationThreshold >= 0.85
      ? "Strict (0.85)"
      : "Standard (0.75)";

  return (
    <View style={s.root}>
      <ScreenHeader title="Voice Security" />
      <KeyboardAwareScrollView contentContainerStyle={[s.content, { paddingBottom: insets.bottom + 24 }]} bottomOffset={24}>
        <View style={s.hero} testID="voice-security-hero">
          <View style={[s.bigDot, { backgroundColor: isEnrolled ? colors.success : colors.warning }]} />
          <View style={{ flex: 1 }}>
            <Text style={s.heroTitle} testID="voice-security-status">
              {isEnrolled ? "Voice Profile Active" : "Enrollment Needed"}
            </Text>
            <Text style={s.heroSub}>
              {isEnrolled
                ? "Your assistant authorizes actions only when your unique voice embedding is verified."
                : "Enroll your voice so the assistant can recognize and accept commands only from you."}
            </Text>
          </View>
        </View>

        {/* Enrollment / Calibration Wizard */}
        {enrolling ? (
          <Section title={`Voice Calibration (${step + 1}/${CALIBRATION_PROMPTS.length})`} footer="Speak naturally in your normal conversational tone.">
            <View style={s.promptCard}>
              <Text style={s.promptLabel}>Prompt {step + 1}:</Text>
              <Text style={s.promptText}>&ldquo;{CALIBRATION_PROMPTS[step]}&rdquo;</Text>
              <Pressable
                onPress={handleRecordSample}
                disabled={recording}
                style={[s.recordBtn, recording && s.recordBtnActive]}
                testID="enroll-record-button"
              >
                <Icon name={recording ? "radio" : "mic"} size={22} color="#ffffff" />
                <Text style={s.recordBtnText}>{recording ? "Analyzing audio..." : "Tap & Speak Prompt"}</Text>
              </Pressable>
            </View>
            <Row
              icon="close-circle-outline"
              title="Cancel enrollment"
              danger
              onPress={() => setEnrolling(false)}
              last
              testID="cancel-enrollment"
            />
          </Section>
        ) : (
          <Section title="Voice Profile">
            {isEnrolled ? (
              <>
                <Row
                  icon="shield-checkmark-outline"
                  title="Owner status"
                  value="Enrolled & Encrypted"
                  subtitle="Protected by Android Keystore (AES-256-GCM)"
                  testID="owner-status-row"
                />
                <Row
                  icon="refresh-outline"
                  title="Re-enroll voice"
                  subtitle="Record fresh calibration prompts"
                  onPress={startEnrollmentFlow}
                  testID="re-enroll-row"
                />
                <Row
                  icon="checkmark-circle-outline"
                  title={recording ? "Testing..." : "Test voice recognition"}
                  subtitle="Speak an utterance to check confidence score"
                  onPress={handleTestVoice}
                  testID="test-voice-row"
                />
                {testResult && (
                  <View style={s.testCard} testID="test-result-card">
                    <View style={s.testResultHeader}>
                      <Icon
                        name={testResult.verified ? "checkmark-circle" : "close-circle"}
                        size={20}
                        color={testResult.verified ? colors.success : colors.error}
                      />
                      <Text style={[s.testResultTitle, { color: testResult.verified ? colors.success : colors.error }]}>
                        {testResult.verified ? "Authorized Owner" : "Verification Failed"}
                      </Text>
                    </View>
                    <Text style={s.testResultBody}>{testResult.message}</Text>
                  </View>
                )}
                <Row
                  icon="trash-outline"
                  title="Delete voice profile"
                  subtitle="Permanently destroys biometric encryption key"
                  danger
                  onPress={() => setDeleteSheet(true)}
                  last
                  testID="delete-voice-profile"
                />
              </>
            ) : (
              <Row
                icon="mic-outline"
                title="Start voice enrollment"
                subtitle="Record 4 quick calibration sentences"
                onPress={startEnrollmentFlow}
                last
                testID="start-enrollment-row"
              />
            )}
          </Section>
        )}

        <Section title="Authorization & Security Policies" footer="Fails closed: Any unrecognized or ambiguous speaker is rejected without executing device actions or revealing personal information.">
          <Row
            icon="lock-closed-outline"
            title="Owner-only mode"
            subtitle="Reject commands from other speakers"
            switchValue={settings.ownerOnlyMode}
            onSwitch={(v) => update({ ownerOnlyMode: v })}
            testID="toggle-owner-only"
          />
          <Row
            icon="options-outline"
            title="Verification threshold"
            value={thresholdLabel}
            onPress={() =>
              setPicker({
                title: "Speaker Verification Threshold",
                current: settings.voiceVerificationThreshold,
                options: [
                  { label: "Standard (0.75) · Recommended", value: 0.75, note: "Balanced accuracy and false rejection rate" },
                  { label: "Strict (0.85)", value: 0.85, note: "Maximum security against similar voices" },
                  { label: "Relaxed (0.65)", value: 0.65, note: "More forgiving in noisy environments" },
                ],
                onPick: (v: number) => update({ voiceVerificationThreshold: v }),
              })
            }
            testID="threshold-picker-row"
          />
          <Row
            icon="finger-print-outline"
            title="Anti-spoofing guard"
            subtitle="Filters out loudspeaker replays and recordings"
            switchValue={settings.antiSpoofingEnabled}
            onSwitch={(v) => update({ antiSpoofingEnabled: v })}
            last
            testID="toggle-anti-spoofing"
          />
        </Section>
      </KeyboardAwareScrollView>

      <OptionSheet picker={picker} onClose={() => setPicker(null)} />

      <Sheet visible={deleteSheet} onClose={() => setDeleteSheet(false)} title="Delete voice profile?" testID="delete-voice-sheet">
        <Text style={s.sheetText}>
          Your encrypted biometric voice template and its Android Keystore key will be permanently deleted. Hands-free owner authentication will be deactivated until you enroll again.
        </Text>
        <SheetButton label="Delete permanently" tone="danger" onPress={handleDeleteProfile} testID="confirm-delete-voice" />
        <SheetButton label="Keep profile" tone="ghost" onPress={() => setDeleteSheet(false)} testID="cancel-delete-voice" />
      </Sheet>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  content: { paddingHorizontal: 20, paddingTop: 8 },
  hero: { flexDirection: "row", gap: 14, alignItems: "flex-start", paddingVertical: 20, marginBottom: 8 },
  bigDot: { width: 14, height: 14, borderRadius: 7, marginTop: 4 },
  heroTitle: { fontSize: 18, fontWeight: "600", color: c.onSurface },
  heroSub: { fontSize: 13, color: c.muted, marginTop: 4, lineHeight: 18 },
  promptCard: {
    backgroundColor: c.surfaceSecondary,
    padding: 18,
    borderRadius: 14,
    marginVertical: 8,
  },
  promptLabel: { fontSize: 12, fontWeight: "600", color: c.accent, textTransform: "uppercase" },
  promptText: { fontSize: 17, fontWeight: "500", color: c.onSurface, marginVertical: 12, lineHeight: 24 },
  recordBtn: {
    backgroundColor: c.accent,
    paddingVertical: 14,
    borderRadius: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: 6,
  },
  recordBtnActive: { backgroundColor: c.error },
  recordBtnText: { color: "#ffffff", fontWeight: "600", fontSize: 15 },
  testCard: {
    backgroundColor: c.surfaceSecondary,
    padding: 14,
    borderRadius: 10,
    marginVertical: 8,
    borderWidth: 1,
    borderColor: c.border,
  },
  testResultHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 4 },
  testResultTitle: { fontSize: 15, fontWeight: "600" },
  testResultBody: { fontSize: 13, color: c.muted, lineHeight: 18 },
  sheetText: { fontSize: 14, color: c.muted, lineHeight: 20, marginBottom: 18 },
}));
