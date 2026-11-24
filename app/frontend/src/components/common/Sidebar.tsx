import { APP_VERSION } from "@/src/constants/capabilities";
import { Icon } from "@/src/components/common/Icon";
import { useTheme, makeStyles } from "@/src/theme";
import { usePathname, useRouter } from "expo-router";
import { useEffect, useState } from "react";
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
  const { colors } = useTheme();
  const s = useStyles();

  // Initialize Animated values via useState factory to avoid accessing ref.current during render (React 19 / ESLint compliant)
  const [slideAnim] = useState(() => new Animated.Value(-SIDEBAR_WIDTH));
  const [backdropOpacity] = useState(() => new Animated.Value(0));

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
        style={[s.backdrop, { opacity: backdropOpacity }]}
        pointerEvents={visible ? "auto" : "none"}
      >
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
      </Animated.View>

      {/* Sidebar panel */}
      <Animated.View
        style={[
          s.sidebar,
          {
            paddingTop: insets.top + 16,
            paddingBottom: insets.bottom + 16,
            transform: [{ translateX: slideAnim }],
          },
        ]}
      >
        {/* Header */}
        <View style={s.header}>
          <View style={s.logoRow}>
            <Icon name="sparkles" size={28} color={colors.accent} />
            <Text style={s.appName}>Aria</Text>
          </View>
          <Text style={s.versionSmall}>v{APP_VERSION}</Text>
        </View>

        {/* Main nav items */}
        <View style={s.navSection}>
          {NAV_ITEMS.map((item) => {
            const active = isActive(item.route);
            return (
              <Pressable
                key={item.route}
                onPress={() => navigate(item.route)}
                style={[s.navItem, active && s.navItemActive]}
                android_ripple={{ color: colors.surfaceTertiary }}
              >
                <Icon
                  name={item.icon as any}
                  size={22}
                  color={active ? colors.accent : colors.muted}
                />
                <Text
                  style={[s.navLabel, active && s.navLabelActive]}
                >
                  {item.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {/* Divider */}
        <View style={s.divider} />

        {/* Bottom nav items */}
        <View style={s.navSection}>
          {BOTTOM_ITEMS.map((item) => {
            const active = isActive(item.route);
            return (
              <Pressable
                key={item.route}
                onPress={() => navigate(item.route)}
                style={[s.navItem, active && s.navItemActive]}
                android_ripple={{ color: colors.surfaceTertiary }}
              >
                <Icon
                  name={item.icon as any}
                  size={22}
                  color={active ? colors.accent : colors.muted}
                />
                <Text
                  style={[s.navLabel, active && s.navLabelActive]}
                >
                  {item.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {/* Footer version */}
        <View style={s.footer}>
          <Text style={s.footerText}>Aria · v{APP_VERSION}</Text>
        </View>
      </Animated.View>
    </Modal>
  );
}

const useStyles = makeStyles((c) => ({
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
    backgroundColor: c.surface,
    borderRightWidth: 1,
    borderRightColor: c.border,
    flexDirection: "column",
  },
  header: {
    paddingHorizontal: 20,
    paddingBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: c.border,
    marginBottom: 8,
  },
  logoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 4,
  },
  appName: {
    color: c.onSurface,
    fontSize: 20,
    fontWeight: "700",
    letterSpacing: -0.4,
  },
  versionSmall: {
    color: c.muted,
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
    backgroundColor: c.surfaceTertiary,
  },
  navLabel: {
    color: c.muted,
    fontSize: 15,
    fontWeight: "500",
  },
  navLabelActive: {
    color: c.accent,
    fontWeight: "600",
  },
  divider: {
    height: 1,
    backgroundColor: c.divider,
    marginHorizontal: 20,
    marginVertical: 8,
  },
  footer: {
    marginTop: "auto",
    paddingHorizontal: 20,
    paddingTop: 12,
  },
  footerText: {
    color: c.muted,
    fontSize: 12,
  },
}));
