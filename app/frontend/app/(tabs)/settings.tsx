import { useRouter } from "expo-router";
import { useState } from "react";
import { ScrollView, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { MicSheet } from "@/src/components/assistant/MicSheet";
import { OptionSheet, type OptionPicker } from "@/src/components/common/OptionSheet";
import { Row, Section } from "@/src/components/common/Row";
import { Sheet, SheetButton } from "@/src/components/common/Sheet";
import { APP_VERSION } from "@/src/constants/capabilities";
import { useMicPermission } from "@/src/hooks/useMicPermission";
import { usesNativeTabs } from "@/src/navigation";
import { conversationRepository } from "@/src/services/storage/SQLiteService";
import { useModels } from "@/src/store/models";
import { useSettings, type Settings } from "@/src/store/settings";
import { makeStyles, useTheme } from "@/src/theme";

export default function SettingsScreen() {
  const s = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { settings, update } = useSettings();
  const { selectedLlm, selectedStt } = useModels();
  const { perm, refresh } = useMicPermission();
  const [picker, setPicker] = useState<OptionPicker<any> | null>(null);
  const [mic, setMic] = useState(false);
  const [sheet, setSheet] = useState<null | "clear" | "name" | "privacy">(null);
  const [name, setName] = useState(settings.name);
  const [cleared, setCleared] = useState(false);

  const pick = <K extends keyof Settings>(key: K, title: string, options: { label: string; value: Settings[K]; note?: string }[]) =>
    setPicker({ title, options, current: settings[key], onPick: (v: Settings[K]) => update({ [key]: v } as Partial<Settings>) });

  const micLabel = !perm ? "…" : perm.granted ? "Allowed" : perm.canAskAgain ? "Not granted" : "Blocked";

  return (
    <View style={s.root}>
      <ScrollView contentContainerStyle={[s.content, { paddingTop: insets.top + 12, paddingBottom: (usesNativeTabs ? insets.bottom : 0) + 24 }]}>
        <View style={s.headerRow}>
          <View style={{ width: 48 }} />
          <Text style={s.title}>Settings</Text>
        </View>

        {/* ── Voice & Listening ── */}
        <Section title="Voice & Listening" footer="Foreground service with persistent microphone notification keeps wake-word listening compliant and active in background.">
          <Row
            icon="ear-outline"
            title="Hands-free mode"
            subtitle={settings.handsFreeEnabled ? "Enabled · Listening active" : "Off"}
            value={settings.handsFreeEnabled ? "On" : "Off"}
            onPress={() => router.push("/hands-free")}
            testID="settings-hands-free"
          />
          <Row
            icon="chatbubble-outline"
            title="Wake phrase"
            value={settings.wakePhrase}
            onPress={() => router.push("/hands-free")}
            testID="settings-wake-phrase"
          />
          <Row
            icon="mic-outline"
            title="Microphone access"
            value={micLabel}
            onPress={() => setMic(true)}
            testID="settings-microphone"
          />
          <Row
            icon="battery-half-outline"
            title="Background & battery"
            subtitle="Foreground service, battery optimisation"
            onPress={() => router.push("/hands-free")}
            last
            testID="settings-background"
          />
        </Section>

        {/* ── Security ── */}
        <Section title="Security" footer="Owner-only biometric verification protects your personal assistant. Unauthorized speakers cannot issue commands.">
          <Row
            icon="shield-checkmark-outline"
            title="Voice security"
            value={settings.voiceEnrolled ? "Enrolled" : "Setup needed"}
            subtitle={settings.voiceEnrolled ? "Biometric template encrypted with Keystore" : "Enroll your voice to restrict access"}
            onPress={() => router.push("/voice-security" as any)}
            testID="settings-voice-security"
          />
          <Row
            icon="finger-print-outline"
            title="Owner-only mode"
            subtitle="Fail closed on unknown speakers"
            switchValue={settings.ownerOnlyMode}
            onSwitch={(v) => update({ ownerOnlyMode: v })}
            last
            testID="settings-owner-only"
          />
        </Section>

        {/* ── AI & Models ── */}
        <Section title="AI & Models">
          <Row
            icon="hardware-chip-outline"
            title="Active LLM"
            subtitle={selectedLlm ? `${selectedLlm.quantization} · ${selectedLlm.params}` : "No model selected · Tap to choose"}
            value={selectedLlm?.name.split(" ").slice(0, 3).join(" ") ?? "None selected"}
            onPress={() => router.push("/models")}
            testID="settings-active-llm"
          />
          <Row
            icon="mic-circle-outline"
            title="Active STT"
            subtitle={selectedStt ? `${selectedStt.quantization} · ${selectedStt.params}` : "No STT selected · Tap to choose"}
            value={selectedStt?.name.split(" ").slice(0, 2).join(" ") ?? "No STT configured"}
            onPress={() => router.push("/models")}
            testID="settings-active-stt"
          />
          <Row
            icon="thermometer-outline"
            title="Temperature"
            value={String(settings.temperature)}
            status="planned"
            onPress={() => pick("temperature", "Temperature", [0.2, 0.5, 0.7, 1].map((v) => ({ label: String(v), value: v })))}
            testID="settings-temperature"
          />
          <Row
            icon="layers-outline"
            title="Context length"
            value={`${settings.contextLength}`}
            status="planned"
            onPress={() => pick("contextLength", "Context length", [1024, 2048, 4096].map((v) => ({ label: `${v} tokens`, value: v })))}
            last
            testID="settings-context"
          />
        </Section>

        {/* ── Device & Communication ── */}
        <Section title="Device & Communication">
          <Row
            icon="call-outline"
            title="Calling mode"
            value={settings.callMode === "direct" ? "Direct call" : "Safe dialer"}
            subtitle={settings.callMode === "direct" ? "Places phone calls directly" : "Pre-fills number in Android dialer"}
            onPress={() =>
              pick("callMode", "Calling mode", [
                { label: "Safe dialer (Recommended)", value: "dialer", note: "Opens Android dialer for one-tap confirmation" },
                { label: "Direct call", value: "direct", note: "Places calls immediately (requires permission)" },
              ])
            }
            testID="settings-call-mode"
          />
          <Row
            icon="shield-outline"
            title="Device permissions & access"
            subtitle="Microphone, contacts, phone, notifications"
            onPress={() => router.push("/device-access" as any)}
            last
            testID="settings-device-access"
          />
        </Section>

        {/* ── Voice & Personalization ── */}
        <Section title="Voice & Personalization">
          <Row
            icon="person-circle-outline"
            title="Your name"
            value={settings.name || "Not set"}
            onPress={() => { setName(settings.name); setSheet("name"); }}
            testID="settings-name"
          />
          <Row
            icon="person-outline"
            title="Assistant voice"
            value={settings.voice}
            onPress={() => pick("voice", "Assistant voice", ["Aria · neutral", "Leo · warm", "Nova · bright"].map((l) => ({ label: l, value: l, note: "Uses your device's text-to-speech voice" })))}
            testID="settings-voice"
          />
          <Row
            icon="speedometer-outline"
            title="Speech speed"
            value={`${settings.speechRate}×`}
            onPress={() => pick("speechRate", "Speech speed", [0.75, 1, 1.25, 1.5].map((v) => ({ label: `${v}×`, value: v })))}
            testID="settings-speech-rate"
          />
          <Row
            icon="volume-high-outline"
            title="Auto-play responses"
            subtitle="Speak replies aloud using on-device TTS"
            switchValue={settings.autoPlayback}
            onSwitch={(v) => update({ autoPlayback: v })}
            testID="settings-auto-playback"
          />
          <Row
            icon="language-outline"
            title="Recognition language"
            value={settings.language}
            status="planned"
            onPress={() => pick("language", "Recognition language", ["English (US)", "English (India)", "Hindi", "Spanish", "German"].map((l) => ({ label: l, value: l })))}
            last
            testID="settings-language"
          />
        </Section>

        {/* ── Automations ── */}
        <Section title="Automations" footer="Manage remembered personal context and automated time-based routines.">
          <Row
            icon="bookmark-outline"
            title="Personal memory"
            subtitle="View, edit, and delete remembered facts"
            onPress={() => router.push("/memory" as any)}
            testID="settings-personal-memory"
          />
          <Row
            icon="calendar-outline"
            title="Automations & routines"
            subtitle="Scheduled daily briefings and background triggers"
            onPress={() => router.push("/routines" as any)}
            last
            testID="settings-automations"
          />
        </Section>

        {/* ── Privacy ── */}
        <Section title="Privacy" footer="All processing happens on-device. No data leaves your phone.">
          <Row
            icon="shield-checkmark-outline"
            title="Local processing"
            onPress={() => setSheet("privacy")}
            testID="settings-local-processing"
          />
          <Row
            icon="recording-outline"
            title="Audio retention"
            value={settings.audioRetention === "never" ? "Never stored" : "This session"}
            onPress={() => pick("audioRetention", "Audio retention", [{ label: "Never stored", value: "never" }, { label: "Keep for this session", value: "session" }])}
            testID="settings-audio-retention"
          />
          <Row
            icon="time-outline"
            title="Keep conversations"
            value={{ forever: "Forever", "30d": "30 days", "7d": "7 days" }[settings.conversationRetention]}
            onPress={() => pick("conversationRetention", "Keep conversations", [{ label: "Forever", value: "forever" }, { label: "30 days", value: "30d", note: "Older chats removed on launch" }, { label: "7 days", value: "7d", note: "Older chats removed on launch" }])}
            testID="settings-conversation-retention"
          />
          <Row
            icon="trash-outline"
            title={cleared ? "History cleared" : "Clear conversation history"}
            danger
            onPress={() => setSheet("clear")}
            last
            testID="settings-clear-history"
          />
        </Section>

        {/* ── App ── */}
        <Section title="App">
          <Row
            icon="contrast-outline"
            title="Appearance"
            value={{ system: "System", dark: "Dark", light: "Light" }[settings.theme]}
            onPress={() => pick("theme", "Appearance", [{ label: "Dark", value: "dark" }, { label: "Light", value: "light" }, { label: "System", value: "system" }])}
            testID="settings-theme"
          />
          <Row
            icon="pulse-outline"
            title="Diagnostics & offline"
            onPress={() => router.push("/diagnostics")}
            testID="settings-diagnostics"
          />
          <Row
            icon="information-circle-outline"
            title="Version"
            value={APP_VERSION}
            last
            testID="settings-version"
          />
        </Section>
      </ScrollView>

      <OptionSheet picker={picker} onClose={() => setPicker(null)} />
      <MicSheet visible={mic} onClose={() => { setMic(false); refresh(); }} />
      <Sheet visible={sheet === "clear"} onClose={() => setSheet(null)} title="Clear all conversations?" testID="clear-history-sheet">
        <Text style={s.sheetText}>Every conversation and message stored on this device will be permanently deleted.</Text>
        <SheetButton label="Clear history" tone="danger" testID="clear-history-confirm" onPress={async () => { await conversationRepository.clearAll(); setCleared(true); setSheet(null); }} />
        <SheetButton label="Cancel" tone="ghost" testID="clear-history-cancel" onPress={() => setSheet(null)} />
      </Sheet>
      <Sheet visible={sheet === "name"} onClose={() => setSheet(null)} title="Your name" testID="name-sheet">
        <TextInput value={name} onChangeText={setName} placeholder="Used in greetings" placeholderTextColor={colors.muted} style={s.input} autoFocus maxLength={30} testID="name-input" />
        <SheetButton label="Save" testID="name-save-button" onPress={() => { update({ name: name.trim() }); setSheet(null); }} />
      </Sheet>
      <Sheet visible={sheet === "privacy"} onClose={() => setSheet(null)} title="Local processing" testID="privacy-sheet">
        <Text style={s.sheetText}>Conversations are stored in a local database on this device. No cloud AI is used, audio is never uploaded, and nothing is synced. Online search, when it arrives, will always ask first. The microphone is only used after you tap it or explicitly enable hands-free mode.</Text>
        <SheetButton label="Got it" testID="privacy-close" onPress={() => setSheet(null)} />
      </Sheet>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  content: { paddingHorizontal: 20 },
  headerRow: { flexDirection: "row", alignItems: "center", marginBottom: 20 },
  title: { color: c.onSurface, fontSize: 30, fontWeight: "700", letterSpacing: -0.8 },
  sheetText: { color: c.onSurfaceTertiary, fontSize: 15, lineHeight: 22 },
  input: { height: 52, borderRadius: 14, backgroundColor: c.surfaceTertiary, color: c.onSurface, paddingHorizontal: 16, fontSize: 16, borderWidth: 1, borderColor: c.border },
}));
