import { Pressable, Text, View } from "react-native";

import { Sheet } from "@/src/components/common/Sheet";
import { Icon } from "@/src/components/common/Icon";
import { makeStyles, useTheme } from "@/src/theme";

export type OptionPicker<T extends string | number> = {
  title: string;
  options: { label: string; value: T; note?: string }[];
  current: T;
  onPick: (v: T) => void;
};

export function OptionSheet({ picker, onClose }: { picker: OptionPicker<any> | null; onClose: () => void }) {
  const s = useStyles();
  const { colors } = useTheme();
  return (
    <Sheet visible={!!picker} onClose={onClose} title={picker?.title} testID="option-sheet">
      {picker?.options.map((o, i) => {
        const active = o.value === picker.current;
        return (
          <Pressable key={String(o.value)} testID={`option-${i}`} onPress={() => { picker.onPick(o.value); onClose(); }} style={[s.opt, active && { borderColor: colors.brandPrimary }]}>
            <View style={{ flex: 1 }}>
              <Text style={s.label}>{o.label}</Text>
              {o.note ? <Text style={s.note}>{o.note}</Text> : null}
            </View>
            {active ? <Icon name="checkmark-circle" size={20} color={colors.brandPrimary} /> : null}
          </Pressable>
        );
      })}
    </Sheet>
  );
}

const useStyles = makeStyles((c) => ({
  opt: { flexDirection: "row", alignItems: "center", minHeight: 52, borderRadius: 14, borderWidth: 1, borderColor: c.border, paddingHorizontal: 16, paddingVertical: 10, backgroundColor: c.surfaceTertiary },
  label: { color: c.onSurface, fontSize: 15.5, fontWeight: "500" },
  note: { color: c.muted, fontSize: 12.5, marginTop: 2 },
}));
