import type { ReactNode } from "react";
import { Pressable, Switch, Text, View } from "react-native";

import { makeStyles, useTheme } from "@/src/theme";
import type { ImplementationStatus } from "@/src/types";

import { CapabilityStatus } from "./CapabilityStatus";
import { Icon, type IconName } from "./Icon";

export function Section({ title, children, footer }: { title: string; children: ReactNode; footer?: string }) {
  const s = useStyles();
  return (
    <View style={s.section}>
      <Text style={s.sectionTitle}>{title}</Text>
      <View style={s.group}>{children}</View>
      {footer ? <Text style={s.footer}>{footer}</Text> : null}
    </View>
  );
}

type RowProps = {
  icon?: IconName;
  title: string;
  subtitle?: string;
  value?: string;
  status?: ImplementationStatus;
  onPress?: () => void;
  switchValue?: boolean;
  onSwitch?: (v: boolean) => void;
  danger?: boolean;
  last?: boolean;
  right?: ReactNode;
  testID: string;
};

export function Row({ icon, title, subtitle, value, status, onPress, switchValue, onSwitch, danger, last, right, testID }: RowProps) {
  const s = useStyles();
  const { colors } = useTheme();
  const tint = danger ? colors.error : colors.onBrandTertiary;
  return (
    <Pressable onPress={onPress ?? (onSwitch ? () => onSwitch(!switchValue) : undefined)} disabled={!onPress && !onSwitch} testID={testID} style={({ pressed }) => [s.row, pressed && { backgroundColor: colors.surfaceTertiary }]}>
      {icon ? (
        <View style={[s.iconBox, danger && { backgroundColor: colors.surfaceTertiary }]}>
          <Icon name={icon} size={18} color={tint} />
        </View>
      ) : null}
      <View style={[s.body, !last && s.divider]}>
        <View style={s.texts}>
          <Text style={[s.title, danger && { color: colors.error }]} numberOfLines={1}>{title}</Text>
          {subtitle ? <Text style={s.subtitle} numberOfLines={2}>{subtitle}</Text> : null}
          {status && status !== "implemented" ? <View style={{ marginTop: 6 }}><CapabilityStatus status={status} /></View> : null}
        </View>
        {right}
        {value ? <Text style={s.value} numberOfLines={1} testID={`${testID}-value`}>{value}</Text> : null}
        {onSwitch ? (
          <Switch value={!!switchValue} onValueChange={onSwitch} testID={`${testID}-switch`} trackColor={{ true: colors.brandPrimary, false: colors.surfaceTertiary }} thumbColor={colors.onBrandPrimary} />
        ) : onPress ? (
          <Icon name="chevron-forward" size={16} color={colors.muted} />
        ) : null}
      </View>
    </Pressable>
  );
}

const useStyles = makeStyles((c) => ({
  section: { marginBottom: 24 },
  sectionTitle: { color: c.muted, fontSize: 12, fontWeight: "600", letterSpacing: 1, textTransform: "uppercase", marginBottom: 8, marginLeft: 4 },
  group: { backgroundColor: c.surfaceSecondary, borderRadius: 18, borderWidth: 1, borderColor: c.border, overflow: "hidden" },
  footer: { color: c.muted, fontSize: 12.5, lineHeight: 18, marginTop: 8, marginHorizontal: 4 },
  row: { flexDirection: "row", alignItems: "center", paddingLeft: 14, minHeight: 60 },
  iconBox: { width: 34, height: 34, borderRadius: 10, backgroundColor: c.brandTertiary, alignItems: "center", justifyContent: "center", marginRight: 12 },
  body: { flex: 1, flexDirection: "row", alignItems: "center", paddingVertical: 12, paddingRight: 14, gap: 8 },
  divider: { borderBottomWidth: 1, borderBottomColor: c.divider },
  texts: { flex: 1 },
  title: { color: c.onSurface, fontSize: 15.5, fontWeight: "500" },
  subtitle: { color: c.onSurfaceTertiary, fontSize: 13, marginTop: 2, lineHeight: 18 },
  value: { color: c.onSurfaceTertiary, fontSize: 14, maxWidth: 150 },
}));
