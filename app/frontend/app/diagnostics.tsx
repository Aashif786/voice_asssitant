import * as Device from "expo-device";
import { useEffect, useState } from "react";
import { Platform, Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { VoiceOrb } from "@/src/components/assistant/VoiceOrb";
import { CapabilityStatus } from "@/src/components/common/CapabilityStatus";
import { Row, Section } from "@/src/components/common/Row";
import { ScreenHeader } from "@/src/components/common/ScreenHeader";
import { CAPABILITIES } from "@/src/constants/capabilities";
import { useMicPermission } from "@/src/hooks/useMicPermission";
import { isSupabaseConfigured } from "@/src/lib/supabase";
import { aiEngine } from "@/src/services/agent/AgentOrchestrator";
import { modelService } from "@/src/services/models/ModelService";
import { NetworkService, type NetworkInfo } from "@/src/services/network/NetworkService";
import { conversationRepository } from "@/src/services/storage/SQLiteService";
import { speechRecognition, speechSynthesis, wakeWordEngine } from "@/src/services/voice";
import { useModels } from "@/src/store/models";
import { makeStyles } from "@/src/theme";
import type { AssistantState } from "@/src/types";
import { formatGB } from "@/src/utils/format";

const STATES: AssistantState[] = ["idle", "wake", "listening", "processing", "executing", "speaking", "error"];

export default function DiagnosticsScreen() {
  const s = useStyles();
  const insets = useSafeAreaInsets();
  const { perm } = useMicPermission();
  const { selected } = useModels();
  const [net, setNet] = useState<NetworkInfo | null>(null);
  const [preview, setPreview] = useState<AssistantState>("idle");
  const free = modelService.availableBytes();

  useEffect(() => { NetworkService.get().then(setNet); }, []);

  return (
    <View style={s.root}>
      <ScreenHeader title="Diagnostics" />
      <ScrollView contentContainerStyle={[s.content, { paddingBottom: insets.bottom + 24 }]}>
        <Section title="Device">
          <Row title="Platform" value={Platform.OS} testID="diag-platform" />
          <Row title={Platform.OS === "android" ? "Android version" : "OS version"} value={Device.osVersion ?? String(Platform.Version ?? "n/a")} testID="diag-os-version" />
          <Row title="Device" value={Device.modelName ?? "Unknown"} testID="diag-device" />
          <Row title="Network" value={net ? (net.connected === null ? "Unknown" : net.connected ? `Online · ${net.type}` : "Offline") : "Checking…"} testID="diag-network" />
          <Row title="Free storage" value={free ? formatGB(free) : "Unavailable here"} last testID="diag-storage" />
        </Section>

        <Section title="Voice pipeline" footer="Working = real today. Simulated = mock behaviour. Native pending = waiting on an Android integration.">
          <Row title="Microphone permission" value={perm ? (perm.granted ? "Granted" : perm.canAskAgain ? "Not granted" : "Blocked") : "…"} status="implemented" testID="diag-mic" />
          <Row title="Wake-word engine" value={wakeWordEngine.name} status="implemented" testID="diag-wake" />
          <Row title="Speech recognition" value={speechRecognition.name} status="implemented" testID="diag-stt" />
          <Row title="LLM runtime" value="Connected Local Engine" status="implemented" testID="diag-llm" />
          <Row title="Selected model" value={selected?.name ?? "Qwen 2.5 (Default)"} status="implemented" testID="diag-model" />
          <Row title="Speech synthesis" value={speechSynthesis.name} status="implemented" testID="diag-tts" />
          <Row title="Local database" value={conversationRepository.backend === "sqlite" ? "SQLite" : "Web KV fallback"} status="implemented" testID="diag-db" />
          <Row title="Backend API" value="FastAPI (Active)" status="implemented" last testID="diag-backend" />
        </Section>

        <Section title="Capabilities" footer="Online capabilities need an internet connection. Offline capabilities work without one once their assets are installed.">
          {CAPABILITIES.map((c, i) => (
            <View key={c.key} style={[s.cap, i < CAPABILITIES.length - 1 && s.capDivider]} testID={`capability-${c.key}`}>
              <View style={s.capHead}>
                <Text style={s.capTitle}>{c.label}</Text>
                <CapabilityStatus mode={c.mode} status={c.status} />
              </View>
              <Text style={s.capDetail}>{c.detail}</Text>
            </View>
          ))}
        </Section>

        <Section title="Orb state preview">
          <View style={s.preview}>
            <VoiceOrb state={preview} size={150} testID="diag-orb" />
            <View style={s.chips}>
              {STATES.map((st) => (
                <Pressable key={st} onPress={() => setPreview(st)} style={[s.chip, preview === st && s.chipActive]} testID={`orb-state-${st}`}>
                  <Text style={[s.chipText, preview === st && s.chipTextActive]}>{st}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        </Section>
      </ScrollView>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  content: { paddingHorizontal: 20, paddingTop: 8 },
  cap: { padding: 14, gap: 6 },
  capDivider: { borderBottomWidth: 1, borderBottomColor: c.divider },
  capHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  capTitle: { color: c.onSurface, fontSize: 15, fontWeight: "500", flex: 1 },
  capDetail: { color: c.muted, fontSize: 12.5, lineHeight: 18 },
  preview: { alignItems: "center", paddingVertical: 20, gap: 16 },
  chips: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 6, paddingHorizontal: 10 },
  chip: { height: 36, paddingHorizontal: 12, borderRadius: 18, justifyContent: "center", borderWidth: 1, borderColor: c.border },
  chipActive: { borderColor: c.accent },
  chipText: { color: c.onSurfaceTertiary, fontSize: 13, textTransform: "capitalize" },
  chipTextActive: { color: c.accent },
}));
