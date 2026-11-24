import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState, type ElementRef } from "react";
import { FlatList, Pressable, Text, TextInput, View } from "react-native";
import { KeyboardAvoidingView } from "@/src/components/common/SafeKeyboard";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Composer } from "@/src/components/assistant/Composer";
import { VoiceOrb } from "@/src/components/assistant/VoiceOrb";
import { Icon } from "@/src/components/common/Icon";
import { CircleButton, ScreenHeader } from "@/src/components/common/ScreenHeader";
import { MessageItem } from "@/src/components/conversation/MessageItem";
import { useConversation } from "@/src/hooks/useConversation";
import { useVoiceInput } from "@/src/hooks/useVoiceInput";
import { useSettings } from "@/src/store/settings";
import { makeStyles, useTheme } from "@/src/theme";
import type { AssistantState } from "@/src/types";

const STATE_LABEL: Partial<Record<AssistantState, string>> = {
  listening: "Listening… speak now",
  processing: "Thinking on-device…",
  executing: "Running action…",
  speaking: "Speaking…",
  error: "Something went wrong. Try again.",
};
const STARTERS = ["Summarize notes", "Plan my day", "Set reminder", "Draft reply"];

export default function ConversationScreen() {
  const s = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { settings } = useSettings();
  const { id, q, fromVoice } = useLocalSearchParams<{ id: string; q?: string; fromVoice?: string }>();
  const c = useConversation(id === "new" ? null : id);
  const [text, setText] = useState("");
  const listRef = useRef<FlatList>(null);
  const inputRef = useRef<ElementRef<typeof TextInput>>(null);
  const sentInitial = useRef(false);

  const handleVoiceCommit = useCallback((spokenText: string) => {
    if (spokenText.trim()) {
      c.send(spokenText.trim(), { isVoice: true });
    }
  }, [c]);

  const voice = useVoiceInput(handleVoiceCommit);
  const isListening = voice.status === "listening";

  useEffect(() => {
    if (q && !sentInitial.current && !c.loading) {
      sentInitial.current = true;
      c.send(q, { isVoice: fromVoice === "1" });
    }
  }, [q, fromVoice, c]);

  const submit = () => {
    const t = text.trim();
    if (t) {
      setText("");
      c.send(t, { isVoice: false });
    }
  };

  const toggleListening = async () => {
    if (voice.status === "listening") {
      const spoken = await voice.stop();
      if (spoken.trim()) {
        c.send(spoken.trim(), { isVoice: true });
      }
    } else {
      await voice.start();
    }
  };

  const displayState: AssistantState = isListening ? "listening" : voice.error ? "error" : c.state;
  const label = isListening
    ? voice.partial ? `Listening: "${voice.partial}"` : "Listening… speak now"
    : voice.error
    ? voice.error
    : STATE_LABEL[c.state];
  const empty = !c.loading && c.messages.length === 0 && !q;

  return (
    <View style={s.root} testID="conversation-screen">
      <ScreenHeader
        center={
          <View style={s.titleRow}>
            <VoiceOrb state={displayState} size={30} />
            <Text style={s.title} numberOfLines={1} testID="conversation-title">{empty ? "Chat with Assistant" : c.title}</Text>
          </View>
        }
        right={<CircleButton icon="create-outline" label="New conversation" testID="new-conversation-button" onPress={() => router.replace({ pathname: "/conversation/[id]", params: { id: "new" } })} />}
      />
      <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
        {empty ? (
          <View style={s.empty} testID="conversation-empty">
            <Pressable onPress={toggleListening} accessibilityLabel={isListening ? "Stop listening" : "Start speaking"}>
              <VoiceOrb state={displayState} size={190} />
            </Pressable>
            <Text style={s.hi}>Hi{settings.name ? `, ${settings.name}` : ""}</Text>
            <Text style={s.start}>{isListening ? voice.partial || "Listening to your voice…" : "Where should we start?"}</Text>
            <View style={s.starters}>
              {STARTERS.map((t, i) => (
                <Pressable key={t} onPress={() => c.send(t)} style={s.starter} testID={`starter-chip-${i}`}>
                  <Text style={s.starterText}>{t}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        ) : (
          <FlatList
            ref={listRef}
            data={c.messages}
            keyExtractor={(m) => m.id}
            contentContainerStyle={s.list}
            onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => (
              <MessageItem m={item} speaking={c.speakingId === item.id} onSpeak={() => c.speak(item)} onStop={c.stopSpeaking} onResolve={(ok) => c.resolveTool(item.id, ok)} />
            )}
          />
        )}
        {label ? (
          <View style={s.stateBar} testID="assistant-state-indicator">
            <Text style={[s.stateText, c.state === "error" && { color: colors.error }, isListening && { color: colors.accent }]} numberOfLines={1}>{label}</Text>
            {c.state === "speaking" ? (
              <Pressable onPress={c.stopSpeaking} style={s.stop} testID="stop-speaking-button">
                <Icon name="stop" size={14} color={colors.onSurface} />
                <Text style={s.stopText}>Stop</Text>
              </Pressable>
            ) : null}
            {isListening ? (
              <Pressable onPress={toggleListening} style={s.stop} testID="stop-listening-button">
                <Icon name="checkmark" size={14} color={colors.onSurface} />
                <Text style={s.stopText}>Done</Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}
        <View style={[s.composer, { paddingBottom: insets.bottom + 12 }]}>
          <Composer
            ref={inputRef}
            value={text}
            onChangeText={setText}
            onSend={submit}
            onMic={toggleListening}
            isListening={isListening}
            placeholder={isListening ? "Listening… speak now" : "Ask me anything…"}
            disabled={c.state === "processing" || c.state === "executing"}
          />
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  titleRow: { flexDirection: "row", alignItems: "center", gap: 8, maxWidth: "100%" },
  title: { color: c.onSurface, fontSize: 16.5, fontWeight: "600", flexShrink: 1 },
  list: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 8 },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 24 },
  hi: { color: c.onSurfaceTertiary, fontSize: 16, marginTop: 20 },
  start: { color: c.onSurface, fontSize: 26, fontWeight: "600", letterSpacing: -0.6, marginTop: 6 },
  starters: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 8, marginTop: 22 },
  starter: { height: 36, borderRadius: 18, paddingHorizontal: 14, justifyContent: "center", backgroundColor: c.surfaceTertiary },
  starterText: { color: c.onSurfaceSecondary, fontSize: 13.5 },
  stateBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 22, height: 40 },
  stateText: { color: c.accent, fontSize: 13, fontWeight: "500" },
  stop: { flexDirection: "row", alignItems: "center", gap: 6, height: 32, paddingHorizontal: 12, borderRadius: 16, backgroundColor: c.surfaceTertiary },
  stopText: { color: c.onSurface, fontSize: 13, fontWeight: "600" },
  composer: { paddingHorizontal: 16, paddingTop: 6 },
}));
