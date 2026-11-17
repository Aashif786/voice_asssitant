import { useState } from "react";
import { FlatList, Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ScreenHeader } from "@/src/components/common/ScreenHeader";
import { ModelRow } from "@/src/components/models/ModelRow";
import { modelService } from "@/src/services/models/ModelService";
import { useModels } from "@/src/store/models";
import { makeStyles } from "@/src/theme";
import { formatGB } from "@/src/utils/format";

export default function ModelsScreen() {
  const s = useStyles();
  const insets = useSafeAreaInsets();
  const m = useModels();
  const [tab, setTab] = useState<"curated" | "installed">("curated");
  const data = tab === "curated" ? m.models : m.models.filter((x) => m.installed.includes(x.id));
  const used = m.models.filter((x) => m.installed.includes(x.id)).reduce((a, x) => a + x.sizeBytes, 0);
  const free = modelService.availableBytes();

  return (
    <View style={s.root}>
      <ScreenHeader title="Models" />
      <FlatList
        data={data}
        keyExtractor={(x) => x.id}
        contentContainerStyle={s.list}
        ListHeaderComponent={
          <View>
            <Text style={s.h1}>Your AI,</Text>
            <Text style={[s.h1, s.h1Accent]}>Your rules.</Text>
            <Text style={s.lead}>Choose a model for on-device inference. Nothing runs in the cloud.</Text>
            <View style={s.notice} testID="models-sample-notice">
              <Text style={s.noticeText}>Real on-device models. Downloads stream directly from Hugging Face into local storage and execute offline using high-performance llama.cpp.</Text>
            </View>
            <View style={s.seg}>
              {(["curated", "installed"] as const).map((k) => (
                <Pressable key={k} onPress={() => setTab(k)} style={[s.segBtn, tab === k && s.segActive]} testID={`models-tab-${k}`}>
                  <Text style={[s.segText, tab === k && s.segTextActive]}>{k === "curated" ? "Curated" : `Installed (${m.installed.length})`}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        }
        ListEmptyComponent={<Text style={s.empty} testID="models-empty">No models installed yet. Pick one from Curated.</Text>}
        renderItem={({ item }) => (
          <ModelRow
            m={item}
            state={m.stateOf(item.id)}
            progress={m.progress[item.id]}
            error={m.errors[item.id]}
            selected={m.selected?.id === item.id}
            onDownload={() => m.download(item.id)}
            onSelect={() => m.select(item.id)}
            onDelete={() => m.remove(item.id)}
          />
        )}
      />
      <View style={[s.footer, { paddingBottom: insets.bottom + 12 }]}>
        <View style={s.storage} testID="models-storage">
          <Text style={s.storageText}>Downloaded: <Text style={s.bold}>{formatGB(used)}</Text></Text>
          <View style={s.dot} />
          <Text style={s.storageText}><Text style={s.bold}>{free ? formatGB(free) : "n/a"}</Text> available</Text>
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
  lead: { color: c.onSurfaceTertiary, fontSize: 15.5, lineHeight: 23, marginTop: 12 },
  notice: { marginTop: 14, borderLeftWidth: 2, borderLeftColor: c.warning, paddingLeft: 10 },
  noticeText: { color: c.muted, fontSize: 12.5, lineHeight: 18 },
  seg: { flexDirection: "row", backgroundColor: c.surfaceSecondary, borderRadius: 14, padding: 4, marginTop: 20, marginBottom: 16, borderWidth: 1, borderColor: c.border },
  segBtn: { flex: 1, height: 40, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  segActive: { backgroundColor: c.accent },
  segText: { color: c.onSurfaceTertiary, fontWeight: "700", fontSize: 14.5 },
  segTextActive: { color: c.onInfo },
  empty: { color: c.muted, textAlign: "center", marginTop: 30 },
  footer: { paddingHorizontal: 20, paddingTop: 8 },
  storage: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", height: 50, borderRadius: 16, paddingHorizontal: 18, backgroundColor: c.surfaceSecondary, borderWidth: 1, borderColor: c.border },
  storageText: { color: c.onSurfaceTertiary, fontSize: 14 },
  bold: { color: c.onSurface, fontWeight: "700" },
  dot: { width: 5, height: 5, borderRadius: 3, backgroundColor: c.accent },
}));
