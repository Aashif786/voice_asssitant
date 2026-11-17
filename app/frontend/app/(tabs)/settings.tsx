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
  const { selected } = useModels();
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
      <ScrollView contentContainerStyle={[s.content, { paddingTop: insets.top + 16, paddingBottom: (usesNativeTabs ? insets.bottom : 0) + 24 }]}>
        <Text style={s.title}>Settings</Text>

        <Section title="Hands-free assistant" footer="Wake-word listening needs a native Android engine and foreground service. It's not in this build, so the assistant never pretends to listen.">
          <Row icon="ear-outline" title="Hands-free mode" subtitle={settings.handsFreeEnabled ? "Enabled · not listening (engine pending)" : "Off"} status="planned" onPress={() => router.push("/hands-free")} testID="settings-hands-free" />
          <Row icon="chatbubble-outline" title="Wake phrase" value={settings.wakePhrase} onPress={() => router.push("/hands-free")} testID="settings-wake-phrase" />
          <Row icon="mic-outline" title="Microphone" value={micLabel} onPress={() => setMic(true)} testID="settings-microphone" />
          <Row icon="battery-half-outline" title="Background & battery" subtitle="Foreground service, battery optimisation" onPress={() => router.push("/hands-free")} testID="settings-background" />
          <Row icon="phone-portrait-outline" title="Default assistant" subtitle="VoiceInteractionService integration" status="planned" onPress={() => router.push("/hands-free")} last testID="settings-default-assistant" />
        </Section>

        <Section title="Voice">
          <Row icon="language-outline" title="Recognition language" value={settings.language} status="planned" onPress={() => pick("language", "Recognition language", ["English (US)", "English (India)", "Hindi", "Spanish", "German"].map((l) => ({ label: l, value: l })))} testID="settings-language" />
          <Row icon="person-outline" title="Assistant voice" value={settings.voice} status="simulated" onPress={() => pick("voice", "Assistant voice", ["Aria · neutral", "Leo · warm", "Nova · bright"].map((l) => ({ label: l, value: l, note: "Sample voice, applies when offline TTS is installed" })))} testID="settings-voice" />
          <Row icon="speedometer-outline" title="Speech speed" value={`${settings.speechRate}×`} onPress={() => pick("speechRate", "Speech speed", [0.75, 1, 1.25, 1.5].map((v) => ({ label: `${v}×`, value: v })))} testID="settings-speech-rate" />
          <Row icon="volume-high-outline" title="Auto-play responses" subtitle="Playback is simulated until TTS lands" switchValue={settings.autoPlayback} onSwitch={(v) => update({ autoPlayback: v })} last testID="settings-auto-playback" />
        </Section>

        <Section title="AI model">
          <Row icon="hardware-chip-outline" title="Selected model" subtitle={selected ? `${selected.quantization} · ${selected.params}` : "No model selected · Tap to choose"} value={selected?.name.split(" ").slice(0, 3).join(" ")} onPress={() => router.push("/models")} testID="settings-model" />
          <Row icon="thermometer-outline" title="Temperature" value={String(settings.temperature)} status="planned" onPress={() => pick("temperature", "Temperature", [0.2, 0.5, 0.7, 1].map((v) => ({ label: String(v), value: v })))} testID="settings-temperature" />
          <Row icon="layers-outline" title="Context length" value={`${settings.contextLength}`} status="planned" onPress={() => pick("contextLength", "Context length", [1024, 2048, 4096].map((v) => ({ label: `${v} tokens`, value: v })))} last testID="settings-context" />
        </Section>

        <Section title="Privacy">
          <Row icon="shield-checkmark-outline" title="Local processing" subtitle="Nothing leaves this device" onPress={() => setSheet("privacy")} testID="settings-local-processing" />
          <Row icon="recording-outline" title="Audio retention" value={settings.audioRetention === "never" ? "Never stored" : "This session"} onPress={() => pick("audioRetention", "Audio retention", [{ label: "Never stored", value: "never" }, { label: "Keep for this session", value: "session" }])} testID="settings-audio-retention" />
          <Row icon="time-outline" title="Keep conversations" value={{ forever: "Forever", "30d": "30 days", "7d": "7 days" }[settings.conversationRetention]} onPress={() => pick("conversationRetention", "Keep conversations", [{ label: "Forever", value: "forever" }, { label: "30 days", value: "30d", note: "Older chats removed on launch" }, { label: "7 days", value: "7d", note: "Older chats removed on launch" }])} testID="settings-conversation-retention" />
          <Row icon="trash-outline" title={cleared ? "History cleared" : "Clear conversation history"} danger onPress={() => setSheet("clear")} last testID="settings-clear-history" />
        </Section>

        <Section title="Application">
          <Row icon="person-circle-outline" title="Your name" value={settings.name || "Not set"} onPress={() => { setName(settings.name); setSheet("name"); }} testID="settings-name" />
          <Row icon="contrast-outline" title="Appearance" value={{ system: "System", dark: "Dark", light: "Light" }[settings.theme]} onPress={() => pick("theme", "Appearance", [{ label: "Dark", value: "dark" }, { label: "Light", value: "light" }, { label: "System", value: "system" }])} testID="settings-theme" />
          <Row icon="key-outline" title="Permissions" subtitle={`Microphone: ${micLabel}`} onPress={() => setMic(true)} testID="settings-permissions" />
          <Row icon="cloud-offline-outline" title="Offline capabilities" onPress={() => router.push("/diagnostics")} testID="settings-offline" />
          <Row icon="pulse-outline" title="Diagnostics" onPress={() => router.push("/diagnostics")} testID="settings-diagnostics" />
          <Row icon="information-circle-outline" title="Version" value={APP_VERSION} last testID="settings-version" />
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
  title: { color: c.onSurface, fontSize: 30, fontWeight: "700", letterSpacing: -0.8, marginBottom: 20 },
  sheetText: { color: c.onSurfaceTertiary, fontSize: 15, lineHeight: 22 },
  input: { height: 52, borderRadius: 14, backgroundColor: c.surfaceTertiary, color: c.onSurface, paddingHorizontal: 16, fontSize: 16, borderWidth: 1, borderColor: c.border },
}));
