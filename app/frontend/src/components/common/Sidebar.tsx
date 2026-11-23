import { APP_VERSION } from "@/src/constants/capabilities";
import { Icon } from "@/src/components/common/Icon";
import { usePathname, useRouter } from "expo-router";
import { useEffect, useRef } from "react";
import {
  Animated,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

interface SidebarProps {
  visible: boolean;
  onClose: () => void;
}

const SIDEBAR_WIDTH = 280;

const COLORS = {
  surface: "#05070B",
  surfaceSecondary: "#0D1117",
  accent: "#5CE1FF",
  brandPrimary: "#3D8BFF",
  onSurface: "#F2F5F9",
  border: "#1A2029",
  muted: "#6A7482",
  divider: "#141922",
  accentBg: "rgba(92, 225, 255, 0.10)",
};

interface NavItem {
  label: string;
  icon: string;
  route: string;
}

const NAV_ITEMS: NavItem[] = [
  { label: "Assistant", icon: "sparkles-outline", route: "/" },
  { label: "History", icon: "time-outline", route: "/(tabs)/history" },
  { label: "Memory", icon: "bookmark-outline", route: "/memory" },
  { label: "Routines", icon: "calendar-outline", route: "/routines" },
  { label: "Model Manager", icon: "hardware-chip-outline", route: "/models" },
  { label: "Device Access", icon: "shield-outline", route: "/device-access" },
  { label: "Diagnostics", icon: "pulse-outline", route: "/diagnostics" },
];

const BOTTOM_ITEMS: NavItem[] = [
  { label: "Settings", icon: "settings-outline", route: "/(tabs)/settings" },
  {
    label: "Voice Security",
    icon: "shield-checkmark-outline",
    route: "/voice-security",
  },
];

export function Sidebar({ visible, onClose }: SidebarProps) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const pathname = usePathname();
  const slideAnim = useRef(new Animated.Value(-SIDEBAR_WIDTH)).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.timing(slideAnim, {
          toValue: 0,
          duration: 260,
          useNativeDriver: true,
        }),
        Animated.timing(backdropOpacity, {
          toValue: 1,
          duration: 260,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(slideAnim, {
          toValue: -SIDEBAR_WIDTH,
          duration: 220,
          useNativeDriver: true,
        }),
        Animated.timing(backdropOpacity, {
          toValue: 0,
          duration: 220,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [visible, slideAnim, backdropOpacity]);

  const navigate = (route: string) => {
    onClose();
    setTimeout(() => {
      router.push(route as any);
    }, 180);
  };

  const isActive = (route: string) => {
    if (route === "/") return pathname === "/";
    return pathname.startsWith(route.replace("/(tabs)", ""));
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      {/* Backdrop */}
      <Animated.View
        style={[styles.backdrop, { opacity: backdropOpacity }]}
        pointerEvents={visible ? "auto" : "none"}
      >
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
      </Animated.View>

      {/* Sidebar panel */}
      <Animated.View
        style={[
          styles.sidebar,
          {
            paddingTop: insets.top + 16,
            paddingBottom: insets.bottom + 16,
            transform: [{ translateX: slideAnim }],
          },
        ]}
      >
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.logoRow}>
            <Icon name="sparkles" size={28} color={COLORS.accent} />
            <Text style={styles.appName}>Aria</Text>
          </View>
          <Text style={styles.versionSmall}>v{APP_VERSION}</Text>
        </View>

        {/* Main nav items */}
        <View style={styles.navSection}>
          {NAV_ITEMS.map((item) => {
            const active = isActive(item.route);
            return (
              <Pressable
                key={item.route}
                onPress={() => navigate(item.route)}
                style={[styles.navItem, active && styles.navItemActive]}
                android_ripple={{ color: "rgba(92,225,255,0.12)" }}
              >
                <Icon
                  name={item.icon as any}
                  size={22}
                  color={active ? COLORS.accent : COLORS.muted}
                />
                <Text
                  style={[styles.navLabel, active && styles.navLabelActive]}
                >
                  {item.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {/* Divider */}
        <View style={styles.divider} />

        {/* Bottom nav items */}
        <View style={styles.navSection}>
          {BOTTOM_ITEMS.map((item) => {
            const active = isActive(item.route);
            return (
              <Pressable
                key={item.route}
                onPress={() => navigate(item.route)}
                style={[styles.navItem, active && styles.navItemActive]}
                android_ripple={{ color: "rgba(92,225,255,0.12)" }}
              >
                <Icon
                  name={item.icon as any}
                  size={22}
                  color={active ? COLORS.accent : COLORS.muted}
                />
                <Text
                  style={[styles.navLabel, active && styles.navLabelActive]}
                >
                  {item.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {/* Footer version */}
        <View style={styles.footer}>
          <Text style={styles.footerText}>Aria · v{APP_VERSION}</Text>
        </View>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0, 0, 0, 0.55)",
  },
  sidebar: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    width: SIDEBAR_WIDTH,
    backgroundColor: COLORS.surface,
    borderRightWidth: 1,
    borderRightColor: COLORS.border,
    flexDirection: "column",
  },
  header: {
    paddingHorizontal: 20,
    paddingBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    marginBottom: 8,
  },
  logoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 4,
  },
  appName: {
    color: COLORS.onSurface,
    fontSize: 20,
    fontWeight: "700",
    letterSpacing: -0.4,
  },
  versionSmall: {
    color: COLORS.muted,
    fontSize: 12,
    marginTop: 2,
  },
  navSection: {
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  navItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingVertical: 11,
    paddingHorizontal: 12,
    borderRadius: 10,
    marginVertical: 1,
  },
  navItemActive: {
    backgroundColor: COLORS.accentBg,
  },
  navLabel: {
    color: COLORS.muted,
    fontSize: 15,
    fontWeight: "500",
  },
  navLabelActive: {
    color: COLORS.accent,
  },
  divider: {
    height: 1,
    backgroundColor: COLORS.divider,
    marginHorizontal: 20,
    marginVertical: 8,
  },
  footer: {
    marginTop: "auto",
    paddingHorizontal: 20,
    paddingTop: 12,
  },
  footerText: {
    color: COLORS.muted,
    fontSize: 12,
  },
});
