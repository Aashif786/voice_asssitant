import { useEffect } from "react";
import { ActivityIndicator, Linking, Text, View } from "react-native";

import { Sheet, SheetButton } from "@/src/components/common/Sheet";
import { useMicPermission } from "@/src/hooks/useMicPermission";
import { useVoiceInput } from "@/src/hooks/useVoiceInput";
import { makeStyles, useTheme } from "@/src/theme";

/**
 * Real on-device voice capture. Records nothing to the cloud: audio is transcribed locally
 * by Whisper and the final text is handed back via onResult.
 */
export function MicSheet({
  visible,
  onClose,
  onUseKeyboard,
  onResult,
}: {
  visible: boolean;
  onClose: () => void;
  onUseKeyboard?: () => void;
  onResult?: (text: string) => void;
}) {
  const s = useStyles();
  const { colors } = useTheme();
  const { perm, refresh } = useMicPermission();
  const voice = useVoiceInput();

  useEffect(() => {
    if (visible) refresh();
    if (!visible) void voice.cancel();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const close = () => {
    void voice.cancel();
    onClose();
  };

  const stopAndSend = async () => {
    const text = await voice.stop();
    onClose();
    if (text && onResult) onResult(text);
    else if (!text && onUseKeyboard) onUseKeyboard();
  };

  let body;
  if (!perm) {
    body = <ActivityIndicator color={colors.accent} />;
  } else if (perm.granted === false && !perm.canAskAgain) {
    body = (
      <>
        <Text style={s.text} testID="mic-sheet-blocked-text">Microphone access is blocked. Turn it on in system settings, or type instead.</Text>
        <SheetButton label="Open Settings" testID="mic-sheet-open-settings" onPress={() => Linking.openSettings()} />
        <SheetButton label="Type instead" tone="ghost" testID="mic-sheet-use-keyboard" onPress={() => { close(); onUseKeyboard?.(); }} />
      </>
    );
  } else if (voice.status === "unavailable") {
    body = (
      <>
        <Text style={s.text} testID="mic-sheet-unavailable">{voice.error}</Text>
        <SheetButton label="Type instead" testID="mic-sheet-use-keyboard" onPress={() => { close(); onUseKeyboard?.(); }} />
      </>
    );
  } else if (voice.status === "preparing") {
    body = (
      <View style={s.center}>
        <ActivityIndicator color={colors.accent} />
        <Text style={s.text}>Downloading the on-device speech model… {Math.round((voice.modelProgress ?? 0) * 100)}%</Text>
        <Text style={s.hint}>One-time download. After this, speech works fully offline.</Text>
      </View>
    );
  } else if (voice.status === "listening") {
    body = (
      <>
        <View style={s.listening}>
          <View style={[s.pulse, { backgroundColor: colors.accent }]} />
          <Text style={s.text} numberOfLines={4}>{voice.partial || "Listening… speak now."}</Text>
        </View>
        <SheetButton label="Stop & send" testID="mic-sheet-stop" onPress={stopAndSend} />
        <SheetButton label="Cancel" tone="ghost" testID="mic-sheet-cancel-listening" onPress={close} />
      </>
    );
  } else if (voice.status === "error") {
    body = (
      <>
        <Text style={[s.text, { color: colors.error }]} testID="mic-sheet-error">{voice.error}</Text>
        <SheetButton label="Try again" testID="mic-sheet-retry" onPress={() => void voice.start()} />
        <SheetButton label="Type instead" tone="ghost" testID="mic-sheet-use-keyboard" onPress={() => { close(); onUseKeyboard?.(); }} />
      </>
    );
  } else {
    body = (
      <>
        <Text style={s.text} testID="mic-sheet-idle">Tap to talk. Your voice is transcribed on-device and never uploaded.</Text>
        <SheetButton label="Start listening" testID="mic-sheet-start" onPress={() => void voice.start()} />
        <SheetButton label="Type instead" tone="ghost" testID="mic-sheet-use-keyboard" onPress={() => { close(); onUseKeyboard?.(); }} />
      </>
    );
  }

  return (
    <Sheet visible={visible} onClose={close} title="Voice input" testID="mic-sheet">
      <View style={s.wrap}>{body}</View>
    </Sheet>
  );
}

const useStyles = makeStyles((c) => ({
  wrap: { gap: 14 },
  center: { alignItems: "center", gap: 12, paddingVertical: 8 },
  text: { color: c.onSurfaceTertiary, fontSize: 15, lineHeight: 22 },
  hint: { color: c.muted, fontSize: 12.5, lineHeight: 18, textAlign: "center" },
  listening: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 60 },
  pulse: { width: 12, height: 12, borderRadius: 6 },
}));
