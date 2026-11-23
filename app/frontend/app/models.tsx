import { useState } from "react";
import { ActivityIndicator, FlatList, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { CircleButton, ScreenHeader } from "@/src/components/common/ScreenHeader";
import { ModelRow } from "@/src/components/models/ModelRow";
import { Icon } from "@/src/components/common/Icon";
import { modelService } from "@/src/services/models/ModelService";
import { useModels } from "@/src/store/models";
import { makeStyles, useTheme } from "@/src/theme";
import { formatGB } from "@/src/utils/format";

type TabKey = "llm" | "stt" | "installed";
type FilterKey = "All" | "Local" | "Cloud" | "No Download" | "Fast (<1B)" | "Multilingual";

const FILTER_CHIPS: FilterKey[] = ["All", "Local", "Cloud", "No Download", "Fast (<1B)", "Multilingual"];

export default function ModelsScreen() {
  const s = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const m = useModels();
  const [tab, setTab] = useState<TabKey>("llm");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<FilterKey>("All");
  const [isDiscovering, setIsDiscovering] = useState(false);
  const [discoveredCount, setDiscoveredCount] = useState<number | null>(null);

  const baseData =
    tab === "llm"
      ? m.llmModels
      : tab === "stt"
      ? m.sttModels
      : m.models.filter((x) => m.installed.includes(x.id));

  // Apply search filter
  const searchFiltered = baseData.filter(
    (x) =>
      !search ||
      x.name.toLowerCase().includes(search.toLowerCase()) ||
      x.family.toLowerCase().includes(search.toLowerCase()) ||
      x.provider.toLowerCase().includes(search.toLowerCase())
  );

  // Apply chip filter
  const data = searchFiltered.filter((x) => {
    switch (filter) {
      case "Local":
        return x.execution === "local";
      case "Cloud":
        return x.execution === "cloud" || x.execution === "system";
      case "No Download":
        return !x.requiresDownload;
      case "Fast (<1B)":
        return x.params.includes("M") || x.params === "Built-in" || x.params === "Cloud/LAN" || x.params === "1B";
      case "Multilingual":
        return x.languages.length > 1 || x.languages.some((l) => l.includes("+"));
      default:
        return true;
    }
  });

  const used = m.models
    .filter((x) => m.installed.includes(x.id) && x.requiresDownload)
    .reduce((a, x) => a + x.sizeBytes, 0);
  const free = modelService.availableBytes();

  const handleDiscover = async () => {
    setIsDiscovering(true);
    setDiscoveredCount(null);
    try {
      const q = search.trim() || (tab === "stt" ? "whisper" : "gguf");
      const targetType = tab === "stt" ? "stt" : "llm";
      const results = await m.discover(q, targetType);
      setDiscoveredCount(results.length);
    } finally {
      setIsDiscovering(false);
    }
  };

  const deviceSuggestion =
    tab === "llm"
      ? "✓ Qwen 2.5 0.5B / DeepSeek R1 1.5B — fast, private, instant offline reasoning"
      : tab === "stt"
      ? "✓ System Speech Recognizer / Whisper Base — private, zero lag"
      : null;

  return (
    <View style={s.root}>
      <ScreenHeader
        title="Model Manager"
        right={
          <CircleButton
            icon="sync-outline"
            label="Sync models"
            testID="sync-models-button"
            onPress={() => m.refreshCatalogue()}
          />
        }
      />
      <FlatList
        data={data}
        keyExtractor={(x) => x.id}
        contentContainerStyle={s.list}
        ListHeaderComponent={
          <View>
            <Text style={s.h1}>Frontier AI,</Text>
            <Text style={[s.h1, s.h1Accent]}>Your rules.</Text>
            <Text style={s.lead}>
              Configure your reasoning and speech-to-text models dynamically. Fetch frontier models from providers with no fixed limits.
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
                Models operate privately and transparently. Dynamically discover any model from Hugging Face or provider endpoints below.
              </Text>
            </View>

            {/* Segment tabs */}
            <View style={s.seg}>
              {(
                [
                  { key: "llm", label: `LLM Reasoning (${m.llmModels.length})` },
                  { key: "stt", label: `Speech-to-Text (${m.sttModels.length})` },
                  { key: "installed", label: `Installed (${m.installed.length})` },
                ] as const
              ).map(({ key, label }) => (
                <Pressable
                  key={key}
                  onPress={() => { setTab(key); setFilter("All"); setSearch(""); setDiscoveredCount(null); }}
                  style={[s.segBtn, tab === key && s.segActive]}
                  testID={`models-tab-${key}`}
                >
                  <Text style={[s.segText, tab === key && s.segTextActive]}>{label}</Text>
                </Pressable>
              ))}
            </View>

            {/* Device suggestion banner */}
            {deviceSuggestion && (
              <View style={s.deviceSuggestion}>
                <Text style={s.deviceSuggestionTitle}>⭐ Suggested for your system</Text>
                <Text style={s.deviceSuggestionText}>{deviceSuggestion}</Text>
              </View>
            )}

            {/* Search and Dynamic Discovery Bar */}
            <View style={s.searchWrap}>
              <TextInput
                style={s.searchBar}
                placeholder="Search or enter model keyword (e.g. deepseek, qwen, whisper, mistral)…"
                placeholderTextColor={colors.onSurfaceTertiary}
                value={search}
                onChangeText={setSearch}
              />
              <Pressable
                style={[s.discoverBtn, isDiscovering && { opacity: 0.7 }]}
                onPress={handleDiscover}
                disabled={isDiscovering}
              >
                {isDiscovering ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <>
                    <Icon name="search" size={14} color="#fff" />
                    <Text style={s.discoverBtnText}>Fetch from Providers</Text>
                  </>
                )}
              </Pressable>
            </View>

            {discoveredCount !== null && (
              <View style={s.discoverFeedback}>
                <Text style={s.discoverFeedbackText}>
                  ✨ Discovered {discoveredCount} frontier models from providers.
                </Text>
              </View>
            )}

            {/* Filter chips */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: 8, paddingBottom: 12 }}
              style={s.filterRow}
            >
              {FILTER_CHIPS.map((chip) => (
                <Pressable
                  key={chip}
                  onPress={() => setFilter(chip)}
                  style={[s.filterChip, filter === chip && s.filterChipActive]}
                >
                  <Text style={[s.filterChipText, filter === chip && s.filterChipTextActive]}>
                    {chip}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        }
        ListEmptyComponent={
          <View style={{ alignItems: "center", paddingVertical: 24 }}>
            <Text style={s.empty} testID="models-empty">
              {tab === "installed"
                ? "No downloaded models yet. Pick one from LLM Reasoning or Speech-to-Text."
                : search || filter !== "All"
                ? "No local matches found. Tap 'Fetch from Providers' above to discover dynamically!"
                : "No models available in this category."}
            </Text>
            {tab !== "installed" && (
              <Pressable style={s.discoverEmptyBtn} onPress={handleDiscover}>
                <Icon name="cloud-download-outline" size={16} color={colors.accent} />
                <Text style={s.discoverEmptyText}>Discover Models from Hugging Face</Text>
              </Pressable>
            )}
          </View>
        }
        renderItem={({ item }) => {
          const isSuggested =
            (tab === "llm" && ["deepseek-r1-distill-qwen-1.5b", "qwen2.5-0.5b", "llama3.2-1b"].includes(item.id)) ||
            (tab === "stt" && ["stt-system", "stt-whisper-base"].includes(item.id));

          const chips: string[] = [];
          if (item.provider) chips.push(`🏢 ${item.provider}`);
          if (item.execution === "local" || item.execution === "system") chips.push("🔒 Private");
          if (item.execution === "cloud") chips.push("📡 Network");
          if (!item.requiresDownload) chips.push("⚡ Instant Ready");
          else chips.push(`📥 ${formatGB(item.sizeBytes)}`);
          if (item.languages.length > 1 || item.languages.some((l) => l.includes("+")))
            chips.push("🌍 Multi");

          return (
            <View>
              {isSuggested && (
                <View style={s.suggestedBadge}>
                  <Text style={s.suggestedText}>⭐ Suggested for your system</Text>
                </View>
              )}
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
              <View style={s.chipRow}>
                {chips.map((c) => (
                  <View key={c} style={s.miniChip}>
                    <Text style={s.miniChipText}>{c}</Text>
                  </View>
                ))}
              </View>
            </View>
          );
        }}
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
  segText: { color: c.onSurfaceTertiary, fontWeight: "700", fontSize: 12 },
  segTextActive: { color: c.onInfo },
  empty: { color: c.muted, textAlign: "center", marginTop: 10 },
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
  suggestedBadge: {
    backgroundColor: c.brandTertiary,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
    alignSelf: "flex-start",
    marginBottom: 4,
    marginTop: 8,
  },
  suggestedText: { color: c.onBrandTertiary, fontSize: 11.5, fontWeight: "700" },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, paddingHorizontal: 4, paddingBottom: 10, paddingTop: 2 },
  miniChip: {
    backgroundColor: c.surfaceTertiary,
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: c.border,
  },
  miniChipText: { color: c.onSurfaceTertiary, fontSize: 11, fontWeight: "500" },
  filterChip: {
    height: 32,
    paddingHorizontal: 14,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: c.surfaceTertiary,
    borderWidth: 1,
    borderColor: c.border,
  },
  filterChipActive: { backgroundColor: c.accent },
  filterChipText: { color: c.onSurfaceTertiary, fontSize: 12.5, fontWeight: "600" },
  filterChipTextActive: { color: c.onInfo },
  filterRow: { paddingBottom: 12 },
  searchWrap: {
    marginBottom: 10,
    gap: 8,
  },
  searchBar: {
    height: 44,
    borderRadius: 12,
    backgroundColor: c.surfaceTertiary,
    borderWidth: 1,
    borderColor: c.border,
    paddingHorizontal: 14,
    color: c.onSurface,
    fontSize: 14,
  },
  discoverBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    height: 36,
    borderRadius: 10,
    backgroundColor: c.accent,
    alignSelf: "flex-start",
    paddingHorizontal: 14,
  },
  discoverBtnText: {
    color: "#fff",
    fontSize: 12.5,
    fontWeight: "700",
  },
  discoverFeedback: {
    backgroundColor: c.surfaceTertiary,
    borderRadius: 10,
    padding: 8,
    marginBottom: 10,
    borderLeftWidth: 3,
    borderLeftColor: c.success,
  },
  discoverFeedbackText: {
    color: c.onSurface,
    fontSize: 12,
    fontWeight: "600",
  },
  discoverEmptyBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: c.surfaceSecondary,
    borderWidth: 1,
    borderColor: c.border,
  },
  discoverEmptyText: {
    color: c.accent,
    fontSize: 13,
    fontWeight: "600",
  },
  deviceSuggestion: {
    backgroundColor: c.brandTertiary,
    borderRadius: 14,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: c.brandSecondary,
  },
  deviceSuggestionTitle: {
    color: c.onBrandTertiary,
    fontSize: 11.5,
    fontWeight: "700",
    textTransform: "uppercase",
    marginBottom: 4,
  },
  deviceSuggestionText: { color: c.onBrandSecondary, fontSize: 13.5, fontWeight: "600" },
}));
