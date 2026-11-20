import { Pressable, Text, View } from "react-native";
import Svg, { Circle } from "react-native-svg";

import { Icon } from "@/src/components/common/Icon";
import type { ModelInfo, ModelState } from "@/src/services/models/ModelService";
import { makeStyles, useTheme } from "@/src/theme";
import { formatGB } from "@/src/utils/format";

function Ring({ p, color, track }: { p: number; color: string; track: string }) {
  const r = 17;
  const c = 2 * Math.PI * r;
  return (
    <Svg width={40} height={40}>
      <Circle cx={20} cy={20} r={r} stroke={track} strokeWidth={3} fill="none" />
      <Circle cx={20} cy={20} r={r} stroke={color} strokeWidth={3} fill="none" strokeDasharray={`${c}`} strokeDashoffset={c * (1 - p)} strokeLinecap="round" rotation={-90} origin="20, 20" />
    </Svg>
  );
}

type Props = {
  m: ModelInfo;
  state: ModelState;
  progress?: number;
  error?: string;
  selected: boolean;
  onDownload: () => void;
  onSelect: () => void;
  onDelete: () => void;
};

export function ModelRow({ m, state, progress = 0, error, selected, onDownload, onSelect, onDelete }: Props) {
  const s = useStyles();
  const { colors } = useTheme();
  const hue = colors[m.hue] || colors.accent;
  const compatColor =
    m.compatibility.level === "likely"
      ? colors.success
      : m.compatibility.level === "unverified"
      ? colors.warning
      : colors.error;

  const isStt = m.type === "stt";
  const iconName = isStt ? "mic-outline" : "chatbubble-ellipses-outline";

  return (
    <View
      style={[
        s.row,
        selected && { borderColor: colors.brandPrimary, borderWidth: 1.5 },
        state === "downloading" && { borderColor: colors.warning },
      ]}
      testID={`model-row-${m.id}`}
    >
      <View style={[s.mark, { backgroundColor: colors.surfaceTertiary }]}>
        <Icon name={iconName} size={18} color={hue} />
      </View>
      <View style={s.body}>
        {state === "downloading" ? (
          <Text style={[s.kicker, { color: colors.warning }]}>Downloading…</Text>
        ) : null}
        {state === "installed" ? (
          <Text style={[s.kicker, { color: selected ? colors.accent : colors.success }]}>
            {selected ? `Active ${isStt ? "STT" : "LLM"}` : m.requiresDownload ? "Installed" : "Ready"}
          </Text>
        ) : null}
        <Text style={s.name} numberOfLines={1}>
          {m.name}
        </Text>
        <View style={s.metaRow}>
          <View style={[s.badge, { backgroundColor: colors.surfaceTertiary }]}>
            <Text style={[s.badgeText, { color: hue }]}>{m.params}</Text>
          </View>
          <Text style={s.meta}>
            {state === "downloading"
              ? `${formatGB(m.sizeBytes * progress)} / ${formatGB(m.sizeBytes)}`
              : m.sizeBytes > 0
              ? `${m.format} · ${formatGB(m.sizeBytes)}`
              : `${m.format} · ${m.provider}`}
          </Text>
        </View>
        <Text style={s.sub}>
          {m.provider} · {m.languages.join(", ")}
        </Text>
        <Text style={[s.sub, { color: error ? colors.error : compatColor }]} testID={`model-compat-${m.id}`}>
          {error ?? m.compatibility.note}
        </Text>
      </View>
      <View style={s.actions}>
        {state === "downloading" ? (
          <View style={s.ringWrap} testID={`model-progress-${m.id}`}>
            <Ring p={progress} color={colors.warning} track={colors.surfaceTertiary} />
            <Text style={[s.pct, { color: colors.warning }]}>{Math.round(progress * 100)}%</Text>
          </View>
        ) : state === "installed" ? (
          <>
            <Pressable
              onPress={onSelect}
              disabled={selected}
              style={[s.action, selected && { backgroundColor: colors.brandPrimary }]}
              testID={`model-select-${m.id}`}
              accessibilityLabel={`Select ${m.name}`}
            >
              <Icon
                name={selected ? "checkmark" : "radio-button-off"}
                size={20}
                color={selected ? colors.onBrandPrimary : colors.accent}
              />
            </Pressable>
            {m.requiresDownload ? (
              <Pressable
                onPress={onDelete}
                style={s.action}
                testID={`model-delete-${m.id}`}
                accessibilityLabel="Delete model"
              >
                <Icon name="trash-outline" size={18} color={colors.muted} />
              </Pressable>
            ) : null}
          </>
        ) : (
          <Pressable
            onPress={onDownload}
            style={s.action}
            testID={`model-download-${m.id}`}
            accessibilityLabel={state === "error" ? "Retry" : "Download"}
          >
            <Icon
              name={state === "error" ? "refresh" : "arrow-down"}
              size={20}
              color={state === "error" ? colors.error : colors.accent}
            />
          </Pressable>
        )}
      </View>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    padding: 14,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: c.border,
    backgroundColor: c.surfaceSecondary,
    marginBottom: 10,
  },
  mark: { width: 46, height: 46, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  body: { flex: 1, gap: 3 },
  kicker: { fontSize: 12, fontWeight: "700" },
  name: { color: c.onSurface, fontSize: 17, fontWeight: "700", letterSpacing: -0.2 },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  badge: { borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  badgeText: { fontSize: 12, fontWeight: "800" },
  meta: { color: c.onSurfaceTertiary, fontSize: 13.5 },
  sub: { color: c.muted, fontSize: 12 },
  actions: { gap: 8, alignItems: "center" },
  action: { width: 44, height: 44, borderRadius: 22, backgroundColor: c.brandTertiary, alignItems: "center", justifyContent: "center" },
  ringWrap: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  pct: { position: "absolute", fontSize: 10.5, fontWeight: "800" },
}));
