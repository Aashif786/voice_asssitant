import { Buffer } from "buffer";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { LogBox, StyleSheet, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { QueryClientProvider } from "@tanstack/react-query";

import { KeyboardProvider } from "@/src/components/common/SafeKeyboard";
import { ErrorBoundary } from "@/src/components/error-boundary";
import { queryClient } from "@/src/query-client";
import { ModelsProvider } from "@/src/store/models";
import { SettingsProvider } from "@/src/store/settings";
import { useTheme } from "@/src/theme";

if (typeof (globalThis as any).Buffer === "undefined") {
  (globalThis as any).Buffer = Buffer;
}

LogBox.ignoreAllLogs(true);

function Shell() {
  const { scheme, colors } = useTheme();
  return (
    <View style={[styles.root, { backgroundColor: colors.surface }]}>
      <StatusBar style={scheme === "dark" ? "light" : "dark"} />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.surface } }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="conversation/[id]" />
        <Stack.Screen name="models" />
        <Stack.Screen name="diagnostics" />
        <Stack.Screen name="hands-free" />
      </Stack>
    </View>
  );
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={styles.root}>
      <ErrorBoundary>
        <QueryClientProvider client={queryClient}>
          <KeyboardProvider>
            <SettingsProvider>
              <ModelsProvider>
                <Shell />
              </ModelsProvider>
            </SettingsProvider>
          </KeyboardProvider>
        </QueryClientProvider>
      </ErrorBoundary>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({ root: { flex: 1 } });
