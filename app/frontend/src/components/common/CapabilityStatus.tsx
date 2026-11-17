import { Text, View } from "react-native";

import { makeStyles, useTheme } from "@/src/theme";
import type { CapabilityMode, ImplementationStatus } from "@/src/types";

const MODE_LABEL: Record<CapabilityMode, string> = { OFFLINE: "Offline", ONLINE: "Online", CONDITIONAL: "Conditional" };
const STATUS_LABEL: Record<ImplementationStatus, string> = { implemented: "Working", simulated: "Simulated", planned: "Native pending" };

/** Reusable capability indicator: connectivity mode + truthful implementation status. */
export function CapabilityStatus({ mode, status, testID }: { mode?: CapabilityMode; status?: ImplementationStatus; testID?: string }) {
  const s = useStyles();
  const { colors } = useTheme();
  const modeColor = mode === "OFFLINE" ? colors.success : mode === "ONLINE" ? colors.info : colors.onSurfaceTertiary;
  const statusColor = status === "implemented" ? colors.success : status === "simulated" ? colors.warning : colors.muted;
  return (
    <View style={s.row} testID={testID}>
      {mode ? (
        <View style={[s.tag, { borderColor: modeColor }]}>
          <Text style={[s.text, { color: modeColor }]}>{MODE_LABEL[mode]}</Text>
        </View>
      ) : null}
      {status ? (
        <View style={s.tagFlat}>
          <View style={[s.dot, { backgroundColor: statusColor }]} />
          <Text style={[s.text, { color: statusColor }]}>{STATUS_LABEL[status]}</Text>
        </View>
      ) : null}
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  row: { flexDirection: "row", gap: 6, alignItems: "center" },
  tag: { borderWidth: 1, borderRadius: 6, paddingHorizontal: 6, height: 20, justifyContent: "center" },
  tagFlat: { flexDirection: "row", alignItems: "center", gap: 4, height: 20, paddingHorizontal: 6, borderRadius: 6, backgroundColor: c.surfaceTertiary },
  dot: { width: 5, height: 5, borderRadius: 3 },
  text: { fontSize: 10.5, fontWeight: "700", letterSpacing: 0.4, textTransform: "uppercase" },
}));
