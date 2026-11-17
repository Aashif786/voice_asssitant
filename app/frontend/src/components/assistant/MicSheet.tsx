import { useEffect } from "react";
import { ActivityIndicator, Linking, Text, View } from "react-native";

import { CapabilityStatus } from "@/src/components/common/CapabilityStatus";
import { Sheet, SheetButton } from "@/src/components/common/Sheet";
import { useMicPermission } from "@/src/hooks/useMicPermission";
import { makeStyles, useTheme } from "@/src/theme";

/** Truthful manual-mic flow: real permission handling, honest about missing offline STT. */
export function MicSheet({ visible, onClose, onUseKeyboard }: { visible: boolean; onClose: () => void; onUseKeyboard?: () => void }) {
  const s = useStyles();
  const { colors } = useTheme();
  const { perm, refresh, request } = useMicPermission();

  useEffect(() => { if (visible) refresh(); }, [visible, refresh]);

  let body;
  if (!perm) {
    body = <ActivityIndicator color={colors.accent} />;
  } else if (perm.granted) {
    body = (
      <>
        <Text style={s.text} testID="mic-sheet-granted-text">Microphone access is on. Offline speech recognition isn't installed in this build yet, so I can't transcribe your voice. Nothing was recorded.</Text>
        <CapabilityStatus mode="CONDITIONAL" status="planned" />
        <SheetButton label="Type instead" testID="mic-sheet-use-keyboard" onPress={() => { onClose(); onUseKeyboard?.(); }} />
      </>
    );
  } else if (perm.canAskAgain) {
    body = (
      <>
        <Text style={s.text}>Allow the microphone so you can talk to your assistant. Audio stays on this device. It's never uploaded.</Text>
        <SheetButton label="Allow microphone" testID="mic-sheet-allow-button" onPress={request} />
        <SheetButton label="Not now" tone="ghost" testID="mic-sheet-cancel-button" onPress={onClose} />
      </>
    );
  } else {
    body = (
      <>
        <Text style={s.text} testID="mic-sheet-blocked-text">Microphone access is blocked. You can turn it on in system settings. Text input still works.</Text>
        <SheetButton label="Open Settings" testID="mic-sheet-open-settings" onPress={() => Linking.openSettings()} />
        <SheetButton label="Type instead" tone="ghost" testID="mic-sheet-use-keyboard" onPress={() => { onClose(); onUseKeyboard?.(); }} />
      </>
    );
  }

  return (
    <Sheet visible={visible} onClose={onClose} title="Voice input" testID="mic-sheet">
      <View style={s.wrap}>{body}</View>
    </Sheet>
  );
}

const useStyles = makeStyles((c) => ({
  wrap: { gap: 14 },
  text: { color: c.onSurfaceTertiary, fontSize: 15, lineHeight: 22 },
}));
