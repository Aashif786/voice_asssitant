import type { ReactNode } from "react";
import { Modal, Pressable, Text, View } from "react-native";
import { KeyboardAvoidingView } from "@/src/components/common/SafeKeyboard";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { makeStyles } from "@/src/theme";

export function Sheet({ visible, onClose, title, children, testID }: { visible: boolean; onClose: () => void; title?: string; children: ReactNode; testID?: string }) {
  const s = useStyles();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <KeyboardAvoidingView behavior="padding" style={s.flex}>
        <Pressable style={s.backdrop} onPress={onClose} testID={testID ? `${testID}-backdrop` : undefined} />
        <View style={[s.sheet, { paddingBottom: insets.bottom + 20 }]} testID={testID}>
          <View style={s.handle} />
          {title ? <Text style={s.title}>{title}</Text> : null}
          {children}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

export function SheetButton({ label, onPress, tone = "primary", testID }: { label: string; onPress: () => void; tone?: "primary" | "ghost" | "danger"; testID: string }) {
  const s = useStyles();
  return (
    <Pressable onPress={onPress} testID={testID} style={({ pressed }) => [s.btn, tone === "primary" && s.btnPrimary, tone === "danger" && s.btnDanger, pressed && { opacity: 0.8 }]}>
      <Text style={[s.btnText, tone === "primary" && s.btnTextPrimary, tone === "danger" && s.btnTextDanger]}>{label}</Text>
    </Pressable>
  );
}

const useStyles = makeStyles((c) => ({
  flex: { flex: 1, justifyContent: "flex-end" },
  backdrop: { ...({ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 } as const), backgroundColor: "rgba(0,0,0,0.6)" },
  sheet: { backgroundColor: c.surfaceSecondary, borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingHorizontal: 24, paddingTop: 10, borderTopWidth: 1, borderColor: c.border, gap: 12 },
  handle: { alignSelf: "center", width: 36, height: 4, borderRadius: 2, backgroundColor: c.borderStrong, marginBottom: 8 },
  title: { color: c.onSurface, fontSize: 20, fontWeight: "600", letterSpacing: -0.3 },
  btn: { minHeight: 52, borderRadius: 16, alignItems: "center", justifyContent: "center", backgroundColor: c.surfaceTertiary },
  btnPrimary: { backgroundColor: c.brandPrimary },
  btnDanger: { backgroundColor: c.surfaceTertiary },
  btnText: { color: c.onSurface, fontSize: 16, fontWeight: "600" },
  btnTextPrimary: { color: c.onBrandPrimary },
  btnTextDanger: { color: c.error },
}));
