import { useFocusEffect } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { AppState, AppStateStatus, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Icon } from "@/src/components/common/Icon";
import { Row, Section } from "@/src/components/common/Row";
import { ScreenHeader } from "@/src/components/common/ScreenHeader";
import { SheetButton } from "@/src/components/common/Sheet";
import { KeyboardAwareScrollView } from "@/src/components/common/SafeKeyboard";
import { useMicPermission } from "@/src/hooks/useMicPermission";
import { AndroidAssistant } from "@/src/services/android/AndroidAssistant";
import { makeStyles, useTheme } from "@/src/theme";

interface PermissionStatus {
  contacts: boolean;
  directCalls: boolean;
  notifications: boolean;
  foregroundService: boolean;
  mic: boolean;
}

export default function DeviceAccessScreen() {
  const s = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { perm, request } = useMicPermission();

  const [status, setStatus] = useState<PermissionStatus>({
    contacts: false,
    directCalls: false,
    notifications: false,
    foregroundService: false,
    mic: false,
  });

  const checkStatuses = useCallback(async () => {
    try {
      const contacts = await AndroidAssistant.hasContactsPermission();
      const directCalls = await AndroidAssistant.hasDirectCallPermission();
      const notifications = await AndroidAssistant.hasNotificationAccess();
      const foregroundService = await AndroidAssistant.isForegroundServiceRunning();
      const mic = perm?.status === "granted";

      setStatus({
        contacts,
        directCalls,
        notifications,
        foregroundService,
        mic,
      });
    } catch {
      // In web/preview environment
    }
  }, [perm]);

  useFocusEffect(
    useCallback(() => {
      checkStatuses();
    }, [checkStatuses])
  );

  useEffect(() => {
    const sub = AppState.addEventListener("change", (state: AppStateStatus) => {
      if (state === "active") {
        checkStatuses();
      }
    });
    return () => sub.remove();
  }, [checkStatuses]);

  return (
    <View style={[s.root, { backgroundColor: colors.surface }]}>
      <ScreenHeader title="Device access & permissions" />

      <KeyboardAwareScrollView
        contentContainerStyle={[s.content, { paddingBottom: insets.bottom + 32 }]}
      >
        <View style={s.banner}>
          <Icon name="shield-checkmark-outline" size={28} color={colors.brand} />
          <View style={s.bannerContent}>
            <Text style={s.bannerTitle}>Privacy-First Hardware Access</Text>
            <Text style={s.bannerSubtitle}>
              All device operations and permissions are strictly processed locally on your phone. No raw audio, contact details, or notification payloads are ever uploaded to cloud servers.
            </Text>
          </View>
        </View>

        <Section
          title="Core voice & listening"
          footer="Microphone access and background listening are required for wake word detection and speech recognition."
        >
          <Row
            icon="mic-outline"
            title="Microphone access"
            subtitle="Required for voice recognition & enrollment"
            value={status.mic ? "Granted" : "Not granted"}
            status={status.mic ? "implemented" : "planned"}
            onPress={async () => {
              await request();
              await checkStatuses();
            }}
            testID="permission-mic"
          />
          <Row
            icon="radio-outline"
            title="Foreground listening service"
            subtitle="Persistent notification for uninterrupted wake-phrase detection"
            value={status.foregroundService ? "Active" : "Inactive"}
            status={status.foregroundService ? "implemented" : "planned"}
            last
            testID="permission-fgs"
          />
        </Section>

        <Section
          title="Communications & contacts"
          footer="Allows your assistant to find contacts, place safe dialer or direct calls, and compose WhatsApp messages."
        >
          <Row
            icon="people-outline"
            title="Contacts reading"
            subtitle="Queries ContactsContract to resolve contact names"
            value={status.contacts ? "Granted" : "Not granted"}
            status={status.contacts ? "implemented" : "planned"}
            onPress={async () => {
              const res = await AndroidAssistant.requestContactsPermission();
              await checkStatuses();
              if (!res && !status.contacts) {
                // If permission is permanently denied or OS requires manual toggle
                AndroidAssistant.openSettings("app");
              }
            }}
            testID="permission-contacts"
          />
          <Row
            icon="call-outline"
            title="Direct phone calls"
            subtitle="Allows immediate dialing without opening dialer app"
            value={status.directCalls ? "Granted" : "Not granted"}
            status={status.directCalls ? "implemented" : "planned"}
            onPress={async () => {
              const res = await AndroidAssistant.requestCallPermission();
              await checkStatuses();
              if (!res && !status.directCalls) {
                // If permission is permanently denied or OS requires manual toggle
                AndroidAssistant.openSettings("app");
              }
            }}
            last
            testID="permission-call"
          />
        </Section>

        <Section
          title="System notifications & assistant hook"
          footer="Enables reading incoming notifications aloud and launching assistant from lock-screen or system gestures."
        >
          <Row
            icon="notifications-outline"
            title="Notification listener"
            subtitle="Allows assistant to summarize recent notifications"
            value={status.notifications ? "Granted" : "Not granted"}
            status={status.notifications ? "implemented" : "planned"}
            onPress={() => AndroidAssistant.openNotificationAccessSettings()}
            testID="permission-notif"
          />
          <Row
            icon="finger-print-outline"
            title="Default digital assistant"
            subtitle="Configures system assist hook & lock-screen access"
            value="Configure"
            onPress={() => AndroidAssistant.openDefaultAssistantSettings()}
            last
            testID="permission-assistant-hook"
          />
        </Section>

        <View style={s.buttonSection}>
          <SheetButton
            label="Open Android App Settings"
            testID="btn-open-app-settings"
            onPress={() => AndroidAssistant.openSettings("app")}
          />
          <SheetButton
            label="Open Notification Access Settings"
            tone="ghost"
            testID="btn-open-notif-settings"
            onPress={() => AndroidAssistant.openNotificationAccessSettings()}
          />
        </View>
      </KeyboardAwareScrollView>
    </View>
  );
}

const useStyles = makeStyles((colors) =>
  StyleSheet.create({
    root: {
      flex: 1,
    },
    content: {
      paddingHorizontal: 16,
      paddingTop: 12,
    },
    banner: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 12,
      padding: 16,
      backgroundColor: colors.surfaceSecondary,
      borderRadius: 14,
      marginBottom: 20,
    },
    bannerContent: {
      flex: 1,
    },
    bannerTitle: {
      fontSize: 15,
      fontWeight: "600",
      color: colors.onSurface,
      marginBottom: 4,
    },
    bannerSubtitle: {
      fontSize: 13,
      lineHeight: 18,
      color: colors.muted,
    },
    buttonSection: {
      marginTop: 20,
      gap: 10,
    },
  })
);
