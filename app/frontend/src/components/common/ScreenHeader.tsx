import { useRouter } from "expo-router";
import type { ReactNode } from "react";
import { Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { makeStyles, useTheme } from "@/src/theme";

import { Icon, type IconName } from "./Icon";

export function CircleButton({ icon, onPress, testID, label }: { icon: IconName; onPress: () => void; testID: string; label: string }) {
  const s = useStyles();
  const { colors } = useTheme();
  return (
    <Pressable onPress={onPress} testID={testID} accessibilityLabel={label} hitSlop={6} style={({ pressed }) => [s.circle, pressed && { opacity: 0.7, transform: [{ scale: 0.96 }] }]}>
      <Icon name={icon} size={20} color={colors.onSurface} />
    </Pressable>
  );
}

export function ScreenHeader({ title, right, center }: { title?: string; right?: ReactNode; center?: ReactNode }) {
  const s = useStyles();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  return (
    <View style={[s.header, { paddingTop: insets.top + 8 }]}>
      <CircleButton icon="arrow-back" label="Back" testID="header-back-button" onPress={() => (router.canGoBack() ? router.back() : router.replace("/"))} />
      <View style={s.center}>{center ?? <Text style={s.title} numberOfLines={1}>{title}</Text>}</View>
      <View style={s.side}>{right}</View>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 20, paddingBottom: 12, backgroundColor: c.surface, gap: 12 },
  center: { flex: 1, alignItems: "center" },
  side: { width: 44, alignItems: "flex-end" },
  title: { color: c.onSurface, fontSize: 17, fontWeight: "600", letterSpacing: -0.2 },
  circle: { width: 44, height: 44, borderRadius: 22, borderWidth: 1, borderColor: c.borderStrong, alignItems: "center", justifyContent: "center" },
}));
