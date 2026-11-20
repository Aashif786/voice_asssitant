import { forwardRef, type ElementRef } from "react";
import { Pressable, TextInput, View } from "react-native";

import { Icon } from "@/src/components/common/Icon";
import { makeStyles, useTheme } from "@/src/theme";

type Props = {
  value: string;
  onChangeText: (t: string) => void;
  onSend: () => void;
  onMic: () => void;
  isListening?: boolean;
  placeholder?: string;
  disabled?: boolean;
};

export type ComposerRef = ElementRef<typeof TextInput>;

/** Pill composer: text fallback + manual microphone entry point. */
export const Composer = forwardRef<ComposerRef, Props>(function Composer({
  value,
  onChangeText,
  onSend,
  onMic,
  isListening = false,
  placeholder = "Ask anything…",
  disabled,
}, ref) {
  const s = useStyles();
  const { colors } = useTheme();
  const hasText = value.trim().length > 0;
  return (
    <View style={[s.pill, isListening && { borderColor: colors.accent }]}>
      <TextInput
        ref={ref}
        value={value}
        onChangeText={onChangeText}
        placeholder={isListening ? "Listening… speak now" : placeholder}
        placeholderTextColor={isListening ? colors.accent : colors.onSurfaceTertiary}
        style={s.input}
        onSubmitEditing={onSend}
        returnKeyType="send"
        submitBehavior="blurAndSubmit"
        testID="composer-input"
        editable={!isListening}
      />
      {hasText && !isListening ? (
        <Pressable onPress={onSend} disabled={disabled} testID="composer-send-button" accessibilityLabel="Send" style={({ pressed }) => [s.send, (pressed || disabled) && { opacity: 0.7 }]}>
          <Icon name="arrow-up" size={20} color={colors.onBrandPrimary} />
        </Pressable>
      ) : (
        <Pressable
          onPress={onMic}
          testID="composer-mic-button"
          accessibilityLabel={isListening ? "Stop listening and send" : "Speak"}
          style={({ pressed }) => [
            s.mic,
            isListening && { backgroundColor: colors.accent },
            pressed && { opacity: 0.7 },
          ]}
        >
          <Icon
            name={isListening ? "stop" : "mic-outline"}
            size={22}
            color={isListening ? colors.onSurfaceInverse : colors.onSurface}
          />
        </Pressable>
      )}
    </View>
  );
});

const useStyles = makeStyles((c) => ({
  pill: { flexDirection: "row", alignItems: "center", minHeight: 60, borderRadius: 30, paddingLeft: 22, paddingRight: 8, backgroundColor: c.brandTertiary, borderWidth: 1, borderColor: c.brandSecondary },
  input: { flex: 1, color: c.onSurface, fontSize: 16.5, paddingVertical: 14 },
  send: { width: 44, height: 44, borderRadius: 22, backgroundColor: c.brandPrimary, alignItems: "center", justifyContent: "center" },
  mic: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", backgroundColor: c.brandSecondary },
}));
