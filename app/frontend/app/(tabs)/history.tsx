import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, RefreshControl, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Icon } from "@/src/components/common/Icon";
import { Sheet, SheetButton } from "@/src/components/common/Sheet";
import { usesNativeTabs } from "@/src/navigation";
import { conversationRepository } from "@/src/services/storage/SQLiteService";
import { makeStyles, useTheme } from "@/src/theme";
import type { Conversation } from "@/src/types";
import { formatRelative } from "@/src/utils/format";

export default function HistoryScreen() {
  const s = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [items, setItems] = useState<Conversation[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [pending, setPending] = useState<Conversation | null>(null);

  const load = useCallback(async () => {
    try { setItems(await conversationRepository.listConversations()); } catch { setItems([]); }
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const del = async () => {
    if (!pending) return;
    await conversationRepository.deleteConversation(pending.id);
    setPending(null);
    load();
  };
  const openNew = () => router.push({ pathname: "/conversation/[id]", params: { id: "new" } });

  return (
    <View style={s.root}>
      <View style={[s.header, { paddingTop: insets.top + 16 }]}>
        <View>
          <Text style={s.title}>History</Text>
          <Text style={s.sub}>Stored only on this device</Text>
        </View>
        <Pressable onPress={openNew} style={s.newBtn} testID="history-new-conversation">
          <Icon name="add" size={18} color={colors.onBrandPrimary} />
          <Text style={s.newText}>New</Text>
        </Pressable>
      </View>
      {items === null ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={colors.accent} />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(c) => c.id}
          contentContainerStyle={[s.list, { paddingBottom: (usesNativeTabs ? insets.bottom : 0) + 24 }, items.length === 0 && { flex: 1 }]}
          refreshControl={<RefreshControl refreshing={refreshing} tintColor={colors.accent} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}
          ListEmptyComponent={
            <View style={s.empty} testID="history-empty">
              <Icon name="chatbubbles-outline" size={32} color={colors.muted} />
              <Text style={s.emptyTitle}>No conversations yet</Text>
              <Text style={s.emptyText}>Ask your assistant something and it will appear here.</Text>
              <Pressable onPress={openNew} style={s.emptyBtn} testID="history-empty-start"><Text style={s.emptyBtnText}>Start a conversation</Text></Pressable>
            </View>
          }
          renderItem={({ item }) => (
            <Pressable onPress={() => router.push({ pathname: "/conversation/[id]", params: { id: item.id } })} style={({ pressed }) => [s.row, pressed && { opacity: 0.7 }]} testID={`history-item-${item.id}`}>
              <View style={{ flex: 1 }}>
                <View style={s.rowTop}>
                  <Text style={s.rowTitle} numberOfLines={1}>{item.title}</Text>
                  <Text style={s.time}>{formatRelative(item.updatedAt)}</Text>
                </View>
                <Text style={s.preview} numberOfLines={2}>{item.lastMessage}</Text>
              </View>
              <Pressable onPress={() => setPending(item)} hitSlop={8} style={s.del} testID={`history-delete-${item.id}`} accessibilityLabel="Delete conversation">
                <Icon name="trash-outline" size={18} color={colors.muted} />
              </Pressable>
            </Pressable>
          )}
        />
      )}
      <Sheet visible={!!pending} onClose={() => setPending(null)} title="Delete conversation?" testID="delete-confirm-sheet">
        <Text style={s.sheetText}>“{pending?.title}” and all its messages will be permanently removed from this device.</Text>
        <SheetButton label="Delete" tone="danger" onPress={del} testID="delete-confirm-button" />
        <SheetButton label="Cancel" tone="ghost" onPress={() => setPending(null)} testID="delete-cancel-button" />
      </Sheet>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", paddingHorizontal: 20, paddingBottom: 16 },
  title: { color: c.onSurface, fontSize: 30, fontWeight: "700", letterSpacing: -0.8 },
  sub: { color: c.muted, fontSize: 13, marginTop: 2 },
  newBtn: { flexDirection: "row", alignItems: "center", gap: 4, height: 40, paddingHorizontal: 14, borderRadius: 20, backgroundColor: c.brandPrimary },
  newText: { color: c.onBrandPrimary, fontWeight: "600", fontSize: 14 },
  list: { paddingHorizontal: 20 },
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: c.divider },
  rowTop: { flexDirection: "row", alignItems: "baseline", gap: 8 },
  rowTitle: { flex: 1, color: c.onSurface, fontSize: 16, fontWeight: "600" },
  time: { color: c.muted, fontSize: 12 },
  preview: { color: c.onSurfaceTertiary, fontSize: 14, lineHeight: 20, marginTop: 4 },
  del: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", gap: 8, paddingBottom: 60 },
  emptyTitle: { color: c.onSurface, fontSize: 18, fontWeight: "600", marginTop: 8 },
  emptyText: { color: c.muted, fontSize: 14, textAlign: "center", maxWidth: 260 },
  emptyBtn: { marginTop: 12, height: 44, paddingHorizontal: 18, borderRadius: 22, borderWidth: 1, borderColor: c.borderStrong, justifyContent: "center" },
  emptyBtnText: { color: c.onSurface, fontWeight: "600" },
  sheetText: { color: c.onSurfaceTertiary, fontSize: 15, lineHeight: 22 },
}));
