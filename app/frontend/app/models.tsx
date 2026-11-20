import { useState } from "react";
import { FlatList, Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ScreenHeader } from "@/src/components/common/ScreenHeader";
import { ModelRow } from "@/src/components/models/ModelRow";
import { Icon } from "@/src/components/common/Icon";
import { modelService } from "@/src/services/models/ModelService";
import { useModels } from "@/src/store/models";
import { makeStyles, useTheme } from "@/src/theme";
import { formatGB } from "@/src/utils/format";

type TabKey = "llm" | "stt" | "installed";

export default function ModelsScreen() {
  const s = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const m = useModels();
  const [tab, setTab] = useState<TabKey>("llm");

  const data =
    tab === "llm"
      ? m.llmModels
      : tab === "stt"
      ? m.sttModels
      : m.models.filter((x) => m.installed.includes(x.id));

  const used = m.models
    .filter((x) => m.installed.includes(x.id) && x.requiresDownload)
    .reduce((a, x) => a + x.sizeBytes, 0);
  const free = modelService.availableBytes();

  return (
    <View style={s.root}>
      <ScreenHeader title="Model Manager" />
      <FlatList
        data={data}
        keyExtractor={(x) => x.id}
        contentContainerStyle={s.list}
        ListHeaderComponent={
          <View>
            <Text style={s.h1}>Your AI,</Text>
            <Text style={[s.h1, s.h1Accent]}>Your rules.</Text>
            <Text style={s.lead}>
              Configure your on-device reasoning and speech-to-text models independently. Fully transparent, privacy-first.
            </Text>

            {/* Active Selections Summary Card */}
            <View style={s.statusCard}>
              <View style={s.statusRow}>
                <View style={[s.statusIcon, { backgroundColor: colors.surfaceTertiary }]}>
                  <Icon name="chatbubble-ellipses" size={16} color={colors.accent} />
                </View>
                <View style={s.statusTextWrap}>
                  <Text style={s.statusLabel}>Active LLM Engine</Text>
                  <Text style={s.statusValue} numberOfLines={1}>
                    {m.selectedLlm?.name ?? "None configured (Offline rules only)"}
                  </Text>
                </View>
              </View>

              <View style={s.divider} />

              <View style={s.statusRow}>
                <View style={[s.statusIcon, { backgroundColor: colors.surfaceTertiary }]}>
                  <Icon name="mic" size={16} color={m.selectedStt ? colors.success : colors.warning} />
                </View>
                <View style={s.statusTextWrap}>
                  <Text style={s.statusLabel}>Active Speech-to-Text (STT)</Text>
                  <Text
                    style={[s.statusValue, !m.selectedStt && { color: colors.warning }]}
                    numberOfLines={1}
                  >
                    {m.selectedStt?.name ?? "No STT configured (Voice disabled)"}
                  </Text>
                </View>
              </View>
            </View>

            <View style={s.notice} testID="models-sample-notice">
              <Text style={s.noticeText}>
                No model is downloaded automatically. Choose and download your preferred models explicitly below.
              </Text>
            </View>

            <View style={s.seg}>
              {(
                [
                  { key: "llm", label: "LLM Reasoning" },
                  { key: "stt", label: "Speech-to-Text" },
                  { key: "installed", label: `Installed (${m.installed.length})` },
                ] as const
              ).map(({ key, label }) => (
                <Pressable
                  key={key}
                  onPress={() => setTab(key)}
                  style={[s.segBtn, tab === key && s.segActive]}
                  testID={`models-tab-${key}`}
                >
                  <Text style={[s.segText, tab === key && s.segTextActive]}>{label}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        }
        ListEmptyComponent={
          <Text style={s.empty} testID="models-empty">
            {tab === "installed"
              ? "No downloaded models yet. Pick one from LLM Reasoning or Speech-to-Text."
              : "No models available in this category."}
          </Text>
        }
        renderItem={({ item }) => (
          <ModelRow
            m={item}
            state={m.stateOf(item.id)}
            progress={m.progress[item.id]}
            error={m.errors[item.id]}
            selected={m.selectedLlm?.id === item.id || m.selectedStt?.id === item.id}
            onDownload={() => m.download(item.id)}
            onSelect={() => m.select(item.id)}
            onDelete={() => m.remove(item.id)}
          />
        )}
      />
      <View style={[s.footer, { paddingBottom: insets.bottom + 12 }]}>
        <View style={s.storage} testID="models-storage">
          <Text style={s.storageText}>
            Downloaded: <Text style={s.bold}>{formatGB(used)}</Text>
          </Text>
          <View style={s.dot} />
          <Text style={s.storageText}>
            <Text style={s.bold}>{free ? formatGB(free) : "n/a"}</Text> available
          </Text>
        </View>
      </View>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  list: { paddingHorizontal: 20, paddingBottom: 16 },
  h1: { color: c.onSurface, fontSize: 36, fontWeight: "800", letterSpacing: -1.2, lineHeight: 40 },
  h1Accent: { color: c.accent },
  lead: { color: c.onSurfaceTertiary, fontSize: 15, lineHeight: 22, marginTop: 10 },
  statusCard: {
    backgroundColor: c.surfaceSecondary,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: c.border,
    padding: 14,
    marginTop: 16,
    gap: 10,
  },
  statusRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  statusIcon: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  statusTextWrap: { flex: 1 },
  statusLabel: { color: c.onSurfaceTertiary, fontSize: 11.5, textTransform: "uppercase", fontWeight: "700" },
  statusValue: { color: c.onSurface, fontSize: 15, fontWeight: "600", marginTop: 1 },
  divider: { height: 1, backgroundColor: c.border },
  notice: { marginTop: 14, borderLeftWidth: 2, borderLeftColor: c.warning, paddingLeft: 10 },
  noticeText: { color: c.muted, fontSize: 12.5, lineHeight: 18 },
  seg: {
    flexDirection: "row",
    backgroundColor: c.surfaceSecondary,
    borderRadius: 14,
    padding: 4,
    marginTop: 18,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: c.border,
  },
  segBtn: { flex: 1, height: 38, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  segActive: { backgroundColor: c.accent },
  segText: { color: c.onSurfaceTertiary, fontWeight: "700", fontSize: 13 },
  segTextActive: { color: c.onInfo },
  empty: { color: c.muted, textAlign: "center", marginTop: 30 },
  footer: { paddingHorizontal: 20, paddingTop: 8 },
  storage: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    height: 50,
    borderRadius: 16,
    paddingHorizontal: 18,
    backgroundColor: c.surfaceSecondary,
    borderWidth: 1,
    borderColor: c.border,
  },
  storageText: { color: c.onSurfaceTertiary, fontSize: 14 },
  bold: { color: c.onSurface, fontWeight: "700" },
  dot: { width: 5, height: 5, borderRadius: 3, backgroundColor: c.accent },
}));
