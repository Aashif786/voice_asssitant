import { useState } from "react";
import { Linking, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { KeyboardAwareScrollView } from "@/src/components/common/SafeKeyboard";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { MicSheet } from "@/src/components/assistant/MicSheet";
import { CapabilityStatus } from "@/src/components/common/CapabilityStatus";
import { Icon } from "@/src/components/common/Icon";
import { Row, Section } from "@/src/components/common/Row";
import { ScreenHeader } from "@/src/components/common/ScreenHeader";
import { Sheet, SheetButton } from "@/src/components/common/Sheet";
import { useMicPermission } from "@/src/hooks/useMicPermission";
import { wakeWordEngine } from "@/src/services/voice";
import { useSettings, type Settings } from "@/src/store/settings";
import { makeStyles, useTheme } from "@/src/theme";

export default function HandsFreeScreen() {
  const s = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { settings, update } = useSettings();
  const { perm, refresh } = useMicPermission();
  const [consent, setConsent] = useState(false);
  const [mic, setMic] = useState(false);
  const [phrase, setPhrase] = useState(settings.wakePhrase);
  const words = phrase.trim().split(/\s+/).filter(Boolean).length;
  const phraseError = words < 2 || words > 4 ? "Use 2–4 words for reliable detection." : null;
  const listening = wakeWordEngine.getStatus() === "listening";

  return (
    <View style={s.root}>
      <ScreenHeader title="Hands-free" />
      <KeyboardAwareScrollView contentContainerStyle={[s.content, { paddingBottom: insets.bottom + 24 }]} bottomOffset={24}>
        <View style={s.hero} testID="hands-free-hero">
          <View style={[s.bigDot, { backgroundColor: listening ? colors.success : colors.muted }]} />
          <View style={{ flex: 1 }}>
            <Text style={s.heroTitle} testID="hands-free-listening-status">{listening ? "Listening" : "Not listening"}</Text>
            <Text style={s.heroSub}>
              {settings.handsFreeEnabled
                ? "Enabled. It starts once the native wake-word engine and foreground service ship in a development build."
                : "Hands-free is off. Your microphone is only used when you tap it."}
            </Text>
          </View>
        </View>

        <Section title="Activation">
          <Row icon="power-outline" title="Enable hands-free" subtitle="You can turn this off at any time" switchValue={settings.handsFreeEnabled} onSwitch={(v) => (v ? setConsent(true) : update({ handsFreeEnabled: false }))} testID="hands-free-toggle" />
          <View style={s.phraseBox}>
            <Text style={s.label}>Wake phrase</Text>
            <TextInput value={phrase} onChangeText={setPhrase} onBlur={() => !phraseError && update({ wakePhrase: phrase.trim() })} style={s.input} placeholder="Hey Assistant" placeholderTextColor={colors.muted} maxLength={40} testID="wake-phrase-input" />
            {phraseError ? <Text style={s.err} testID="wake-phrase-error">{phraseError}</Text> : <Text style={s.hint}>Saved as &ldquo;{settings.wakePhrase}&rdquo;. Custom phrases depend on engine support.</Text>}
            <Text style={[s.label, { marginTop: 14 }]}>Sensitivity</Text>
            <View style={s.seg}>
              {(["low", "medium", "high"] as Settings["wakeSensitivity"][]).map((k) => (
                <Pressable key={k} onPress={() => update({ wakeSensitivity: k })} style={[s.segBtn, settings.wakeSensitivity === k && s.segActive]} testID={`sensitivity-${k}`}>
                  <Text style={[s.segText, settings.wakeSensitivity === k && s.segTextActive]}>{k}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        </Section>

        <Section title="Readiness">
          <Row icon="mic-outline" title="Microphone permission" value={perm ? (perm.granted ? "Granted" : perm.canAskAgain ? "Needed" : "Blocked") : "…"} onPress={() => setMic(true)} testID="readiness-mic" />
          <Row icon="radio-outline" title="Wake-word engine" subtitle="On-device, offline; to be chosen after licensing & Android checks" status="planned" testID="readiness-engine" />
          <Row icon="notifications-outline" title="Foreground service" subtitle="Kotlin service with a persistent microphone notification" status="planned" testID="readiness-service" />
          <Row icon="lock-closed-outline" title="Lock-screen activation" subtitle="Subject to Android background-mic limits" status="planned" last testID="readiness-lockscreen" />
        </Section>

        <Section title="Background & battery" footer="Android shows a privacy indicator whenever the microphone is active. This app will never hide it or get around system restrictions.">
          <Row icon="battery-charging-outline" title="Battery optimisation" subtitle="Exempting the assistant from optimisation keeps detection reliable. Open app settings to adjust." onPress={() => Linking.openSettings()} testID="battery-settings" />
          <Row icon="pulse-outline" title="Expected battery use" subtitle="Low-power wake-word models typically use a few % per day. It'll be measured on device." last testID="battery-info" />
        </Section>

        <Section title="Default assistant">
          <View style={s.info}>
            <CapabilityStatus mode="OFFLINE" status="planned" />
            <Text style={s.infoText}>Replacing the system assistant needs a VoiceInteractionService and your choice in Android&apos;s default-apps settings. Installing this app doesn&apos;t replace Google Assistant.</Text>
          </View>
        </Section>
      </KeyboardAwareScrollView>

      <Sheet visible={consent} onClose={() => setConsent(false)} title="Enable hands-free listening?" testID="hands-free-consent-sheet">
        {["The microphone listens for your wake phrase only after the native engine is installed.", "Audio is processed on-device and never uploaded or stored.", "A persistent notification shows while listening. Turn it off here at any time."].map((t) => (
          <View key={t} style={s.bullet}><Icon name="checkmark" size={16} color={colors.accent} /><Text style={s.bulletText}>{t}</Text></View>
        ))}
        <SheetButton label="I understand, enable" testID="hands-free-consent-accept" onPress={() => { update({ handsFreeEnabled: true }); setConsent(false); }} />
        <SheetButton label="Not now" tone="ghost" testID="hands-free-consent-cancel" onPress={() => setConsent(false)} />
      </Sheet>
      <MicSheet visible={mic} onClose={() => { setMic(false); refresh(); }} />
    </View>
  );
}

void ScrollView;

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  content: { paddingHorizontal: 20, paddingTop: 8 },
  hero: { flexDirection: "row", gap: 14, alignItems: "flex-start", paddingVertical: 20, marginBottom: 8 },
  bigDot: { width: 12, height: 12, borderRadius: 6, marginTop: 10 },
  heroTitle: { color: c.onSurface, fontSize: 26, fontWeight: "700", letterSpacing: -0.6 },
  heroSub: { color: c.onSurfaceTertiary, fontSize: 14.5, lineHeight: 21, marginTop: 4 },
  phraseBox: { padding: 14, borderTopWidth: 1, borderTopColor: c.divider },
  label: { color: c.muted, fontSize: 12, fontWeight: "600", letterSpacing: 0.6, textTransform: "uppercase", marginBottom: 8 },
  input: { height: 50, borderRadius: 14, backgroundColor: c.surfaceTertiary, color: c.onSurface, paddingHorizontal: 14, fontSize: 16 },
  hint: { color: c.muted, fontSize: 12.5, marginTop: 6 },
  err: { color: c.error, fontSize: 12.5, marginTop: 6 },
  seg: { flexDirection: "row", backgroundColor: c.surfaceTertiary, borderRadius: 12, padding: 3 },
  segBtn: { flex: 1, height: 38, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  segActive: { backgroundColor: c.surfaceSecondary, borderWidth: 1, borderColor: c.borderStrong },
  segText: { color: c.onSurfaceTertiary, fontWeight: "600", textTransform: "capitalize" },
  segTextActive: { color: c.onSurface },
  info: { padding: 14, gap: 10 },
  infoText: { color: c.onSurfaceTertiary, fontSize: 14, lineHeight: 21 },
  bullet: { flexDirection: "row", gap: 10, alignItems: "flex-start" },
  bulletText: { color: c.onSurfaceTertiary, fontSize: 14.5, lineHeight: 21, flex: 1 },
}));
