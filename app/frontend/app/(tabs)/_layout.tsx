import { Stack } from "expo-router";
import { useState } from "react";
import { Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Sidebar } from "@/src/components/common/Sidebar";
import { Icon } from "@/src/components/common/Icon";
import { useTheme } from "@/src/theme";

export default function TabLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();

  return (
    <View style={{ flex: 1 }}>
      <Stack screenOptions={{ headerShown: false }} />
      {/* Hamburger button floating top-left */}
      <Pressable
        onPress={() => setSidebarOpen(true)}
        style={{
          position: "absolute",
          top: insets.top + 12,
          left: 16,
          width: 40,
          height: 40,
          borderRadius: 20,
          backgroundColor: colors.surfaceSecondary,
          borderWidth: 1,
          borderColor: colors.borderStrong,
          alignItems: "center",
          justifyContent: "center",
          zIndex: 50,
        }}
        testID="hamburger-menu"
        accessibilityLabel="Open navigation menu"
      >
        <Icon name="menu-outline" size={22} color={colors.onSurface} />
      </Pressable>
      <Sidebar visible={sidebarOpen} onClose={() => setSidebarOpen(false)} />
    </View>
  );
}
