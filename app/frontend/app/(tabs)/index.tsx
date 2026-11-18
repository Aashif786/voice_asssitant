import { LinearGradient } from "expo-linear-gradient";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useRef, useState, type ElementRef } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { KeyboardAvoidingView } from "@/src/components/common/SafeKeyboard";
import Animated, { FadeIn, FadeInDown } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Composer } from "@/src/components/assistant/Composer";
import { MicSheet } from "@/src/components/assistant/MicSheet";
import { VoiceOrb } from "@/src/components/assistant/VoiceOrb";
import { Icon } from "@/src/components/common/Icon";
import { usesNativeTabs } from "@/src/navigation";
import { conversationRepository } from "@/src/services/storage/SQLiteService";
import { wakeWordEngine } from "@/src/services/voice";
import { useModels } from "@/src/store/models";
import { useSettings } from "@/src/store/settings";
import { makeStyles, useTheme } from "@/src/theme";
import type { AssistantState, Conversation } from "@/src/types";
import { formatRelative, greeting } from "@/src/utils/format";

const SUGGESTIONS = ["What time is it?", "Plan my day", "Remind me to call Rahul at 5 PM", "Draft a WhatsApp message for John"];

export default function AssistantHome() {
  const s = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { settings } = useSettings();
  const { selected } = useModels();
  const [text, setText] = useState("");
  const [state, setState] = useState<AssistantState>("idle");
  const [mic, setMic] = useState(false);
  const [recent, setRecent] = useState<Conversation | null>(null);
  const inputRef = useRef<ElementRef<typeof TextInput>>(null);
  const bottomChrome = usesNativeTabs ? insets.bottom : 0;

  useFocusEffect(useCallback(() => {
    setState("idle");
    conversationRepository.listConversations().then((l) => setRecent(l[0] ?? null)).catch(() => setRecent(null));
  }, []));

  const ask = (q: string) => {
    const t = q.trim();
    if (!t) return;
    setState("processing");
    setText("");
    setTimeout(() => router.push({ pathname: "/conversation/[id]", params: { id: "new", q: t } }), 280);
  };

  const headline = state === "processing" ? "Thinking…" : `How can I help\nyou today?`;
  const handsFree = settings.handsFreeEnabled
    ? wakeWordEngine.isAvailable() ? "Listening for" : "Enabled · engine not installed ·"
    : "Hands-free off ·";

  return (
    <View style={s.root}>
      <LinearGradient colors={["transparent", colors.glow]} style={s.bottomGlow} pointerEvents="none" />
      <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
        <View style={[s.top, { paddingTop: insets.top + 12 }]}>
          <View style={s.status} testID="assistant-status">
            <View style={[s.dot, { backgroundColor: selected ? colors.success : colors.warning }]} />
            <Text style={s.statusText}>{selected ? `Ready · ${selected.name.split(" ").slice(0, 3).join(" ")}` : "No model — open Models"}</Text>
          </View>
          <Pressable onPress={() => router.push("/hands-free")} style={s.wakeBtn} testID="wake-word-shortcut" accessibilityLabel="Hands-free settings">
            <Icon name="ear-outline" size={19} color={colors.onSurface} />
            {settings.handsFreeEnabled ? <View style={[s.wakeDot, { backgroundColor: colors.warning }]} /> : null}
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <Pressable onPress={() => setMic(true)} testID="voice-orb" accessibilityLabel="Talk to assistant" style={s.orb}>
            <VoiceOrb state={state} size={230} />
          </Pressable>
          <Animated.Text entering={FadeIn.delay(100)} style={s.hello} testID="greeting-text">
            {greeting()}{settings.name ? `, ${settings.name}` : ""}
          </Animated.Text>
          <Animated.Text entering={FadeInDown.delay(180)} style={s.headline}>{headline}</Animated.Text>

          <Pressable onPress={() => router.push("/hands-free")} style={s.handsFree} testID="hands-free-status">
            <Text style={s.handsFreeText}>
              {handsFree} <Text style={s.phrase}>&ldquo;{settings.wakePhrase}&rdquo;</Text>
            </Text>
            <Icon name="chevron-forward" size={14} color={colors.muted} />
          </Pressable>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.chipsRow} contentContainerStyle={s.chips} keyboardShouldPersistTaps="handled">
            {SUGGESTIONS.map((q, i) => (
              <Pressable key={q} onPress={() => ask(q)} style={({ pressed }) => [s.chip, pressed && { opacity: 0.7 }]} testID={`suggestion-chip-${i}`}>
                <Text style={s.chipText}>{q}</Text>
              </Pressable>
            ))}
          </ScrollView>

          {recent ? (
            <Pressable onPress={() => router.push({ pathname: "/conversation/[id]", params: { id: recent.id } })} style={s.recent} testID="recent-conversation">
              <View style={{ flex: 1 }}>
                <Text style={s.recentKicker}>Continue · {formatRelative(recent.updatedAt)}</Text>
                <Text style={s.recentTitle} numberOfLines={1}>{recent.title}</Text>
                <Text style={s.recentPreview} numberOfLines={1}>{recent.lastMessage}</Text>
              </View>
              <Icon name="arrow-forward" size={18} color={colors.onSurfaceTertiary} />
            </Pressable>
          ) : null}
        </ScrollView>

        <View style={[s.composer, { paddingBottom: bottomChrome + 12 }]}>
          <Composer ref={inputRef} value={text} onChangeText={setText} onSend={() => ask(text)} onMic={() => setMic(true)} />
        </View>
      </KeyboardAvoidingView>
      <MicSheet visible={mic} onClose={() => setMic(false)} onUseKeyboard={() => setTimeout(() => inputRef.current?.focus(), 300)} onResult={(t) => ask(t)} />
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  bottomGlow: { position: "absolute", left: 0, right: 0, bottom: 0, height: 320, opacity: 0.55 },
  top: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 20 },
  status: { flexDirection: "row", alignItems: "center", gap: 8, height: 34, paddingHorizontal: 12, borderRadius: 17, borderWidth: 1, borderColor: c.border },
  dot: { width: 7, height: 7, borderRadius: 4 },
  statusText: { color: c.onSurfaceTertiary, fontSize: 13, fontWeight: "500" },
  wakeBtn: { width: 44, height: 44, borderRadius: 22, borderWidth: 1, borderColor: c.borderStrong, alignItems: "center", justifyContent: "center" },
  wakeDot: { position: "absolute", top: 9, right: 10, width: 7, height: 7, borderRadius: 4 },
  scroll: { alignItems: "center", paddingTop: 16, paddingBottom: 16 },
  orb: { marginBottom: 20 },
  hello: { color: c.onSurfaceTertiary, fontSize: 17, marginBottom: 10 },
  headline: { color: c.onSurface, fontSize: 34, lineHeight: 40, fontWeight: "600", letterSpacing: -1, textAlign: "center" },
  handsFree: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 18, minHeight: 44, paddingHorizontal: 12 },
  handsFreeText: { color: c.muted, fontSize: 13.5 },
  phrase: { color: c.onBrandTertiary, fontWeight: "600" },
  chipsRow: { height: 56, flexGrow: 0, alignSelf: "stretch", marginTop: 8 },
  chips: { gap: 8, paddingHorizontal: 20, alignItems: "center" },
  chip: { height: 36, flexShrink: 0, borderRadius: 18, paddingHorizontal: 14, justifyContent: "center", backgroundColor: c.surfaceTertiary },
  chipText: { color: c.onSurfaceSecondary, fontSize: 13.5 },
  recent: { flexDirection: "row", alignItems: "center", gap: 12, alignSelf: "stretch", marginHorizontal: 20, marginTop: 16, paddingVertical: 14, borderTopWidth: 1, borderBottomWidth: 1, borderColor: c.divider },
  recentKicker: { color: c.muted, fontSize: 11.5, fontWeight: "600", letterSpacing: 0.6, textTransform: "uppercase" },
  recentTitle: { color: c.onSurface, fontSize: 15.5, fontWeight: "600", marginTop: 3 },
  recentPreview: { color: c.onSurfaceTertiary, fontSize: 13.5, marginTop: 2 },
  composer: { paddingHorizontal: 20, paddingTop: 8 },
}));
