import { Pressable, Text, View } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";

import { CapabilityStatus } from "@/src/components/common/CapabilityStatus";
import { Icon, type IconName } from "@/src/components/common/Icon";
import { ToolRegistry } from "@/src/services/tools/ToolRegistry";
import { makeStyles, useTheme } from "@/src/theme";
import type { Message, ToolCall } from "@/src/types";
import { formatClock } from "@/src/utils/format";

const STATUS_TEXT: Record<ToolCall["status"], string> = {
  pending_confirmation: "Waiting for your confirmation",
  completed: "Done",
  cancelled: "Cancelled",
  unavailable: "Not executed: integration pending",
};

function ToolCard({ tool, onResolve, id }: { tool: ToolCall; onResolve: (ok: boolean) => void; id: string }) {
  const s = useStyles();
  const { colors } = useTheme();
  const def = ToolRegistry.get(tool.tool);
  const color = tool.status === "completed" ? colors.success : tool.status === "pending_confirmation" ? colors.accent : colors.muted;
  return (
    <View style={s.tool} testID={`tool-card-${id}`}>
      <View style={s.toolHead}>
        <Icon name={def.icon as IconName} size={16} color={colors.onBrandTertiary} />
        <Text style={s.toolLabel}>{def.label}</Text>
        <CapabilityStatus mode={def.mode} status={def.status} />
      </View>
      {Object.entries(tool.params).filter(([, v]) => v).map(([k, v]) => (
        <View key={k} style={s.param}>
          <Text style={s.paramKey}>{k}</Text>
          <Text style={s.paramVal}>{v}</Text>
        </View>
      ))}
      <Text style={[s.toolStatus, { color }]} testID={`tool-status-${id}`}>{STATUS_TEXT[tool.status]}</Text>
      {tool.status === "pending_confirmation" ? (
        <View style={s.actions}>
          <Pressable style={s.cancel} onPress={() => onResolve(false)} testID={`tool-cancel-${id}`}>
            <Text style={s.cancelText}>Cancel</Text>
          </Pressable>
          <Pressable style={s.confirm} onPress={() => onResolve(true)} testID={`tool-confirm-${id}`}>
            <Text style={s.confirmText}>Confirm</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

export function MessageItem({ m, speaking, onSpeak, onStop, onResolve }: { m: Message; speaking: boolean; onSpeak: () => void; onStop: () => void; onResolve: (ok: boolean) => void }) {
  const s = useStyles();
  const { colors } = useTheme();
  if (m.role === "user") {
    return (
      <Animated.View entering={FadeInDown.duration(220)} style={s.userWrap} testID={`message-user-${m.id}`}>
        <View style={s.userBubble}><Text style={s.userText}>{m.content}</Text></View>
        <Text style={s.time}>{formatClock(m.createdAt)}</Text>
      </Animated.View>
    );
  }
  return (
    <Animated.View entering={FadeInDown.duration(260)} style={s.aiWrap} testID={`message-assistant-${m.id}`}>
      {m.content ? <Text style={s.aiText}>{m.content}</Text> : null}
      {m.tool ? <ToolCard tool={m.tool} id={m.id} onResolve={onResolve} /> : null}
      <View style={s.meta}>
        <Text style={s.time}>{formatClock(m.createdAt)}</Text>
        <Text style={s.mock}>· on-device</Text>
        <Pressable onPress={speaking ? onStop : onSpeak} hitSlop={10} style={s.play} testID={`message-play-${m.id}`} accessibilityLabel={speaking ? "Stop speaking" : "Play message"}>
          <Icon name={speaking ? "stop-circle" : "volume-medium-outline"} size={17} color={speaking ? colors.accent : colors.muted} />
        </Pressable>
      </View>
    </Animated.View>
  );
}

const useStyles = makeStyles((c) => ({
  userWrap: { alignItems: "flex-end", marginBottom: 20, paddingLeft: 56 },
  userBubble: { backgroundColor: c.surfaceTertiary, borderRadius: 22, borderBottomRightRadius: 6, paddingHorizontal: 16, paddingVertical: 11 },
  userText: { color: c.onSurface, fontSize: 16, lineHeight: 22 },
  aiWrap: { marginBottom: 24, paddingRight: 24 },
  aiText: { color: c.onSurfaceSecondary, fontSize: 16.5, lineHeight: 25 },
  meta: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 8 },
  time: { color: c.muted, fontSize: 12, marginTop: 4 },
  mock: { color: c.muted, fontSize: 12, marginTop: 4 },
  play: { marginLeft: 4, marginTop: 4, minWidth: 28, minHeight: 28, justifyContent: "center" },
  tool: { marginTop: 12, borderRadius: 18, borderWidth: 1, borderColor: c.brandSecondary, backgroundColor: c.brandTertiary, padding: 14, gap: 8 },
  toolHead: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
  toolLabel: { color: c.onSurface, fontWeight: "600", fontSize: 14.5, marginRight: 4 },
  param: { flexDirection: "row", gap: 10 },
  paramKey: { color: c.muted, fontSize: 13, width: 70, textTransform: "capitalize" },
  paramVal: { color: c.onSurfaceSecondary, fontSize: 14, flex: 1 },
  toolStatus: { fontSize: 12.5, fontWeight: "600" },
  actions: { flexDirection: "row", gap: 10, marginTop: 4 },
  cancel: { flex: 1, height: 44, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: c.surfaceTertiary },
  cancelText: { color: c.onSurface, fontWeight: "600" },
  confirm: { flex: 1, height: 44, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: c.brandPrimary },
  confirmText: { color: c.onBrandPrimary, fontWeight: "600" },
}));
