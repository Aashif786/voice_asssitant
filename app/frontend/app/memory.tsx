import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { KeyboardAwareScrollView } from "@/src/components/common/SafeKeyboard";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Icon } from "@/src/components/common/Icon";
import { Row, Section } from "@/src/components/common/Row";
import { ScreenHeader } from "@/src/components/common/ScreenHeader";
import { Sheet, SheetButton } from "@/src/components/common/Sheet";
import { MemoryRepository, type UserMemory } from "@/src/services/storage/MemoryRepository";
import { makeStyles, useTheme } from "@/src/theme";

export default function MemoryScreen() {
  const s = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  const [memories, setMemories] = useState<UserMemory[]>([]);
  const [search, setSearch] = useState("");
  const [addSheet, setAddSheet] = useState(false);
  const [newFact, setNewFact] = useState("");
  const [category, setCategory] = useState<UserMemory["category"]>("fact");
  const [clearSheet, setClearSheet] = useState(false);

  const loadMemories = useCallback(async () => {
    try {
      const list = await MemoryRepository.listMemories();
      setMemories(list);
    } catch {
      setMemories([]);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadMemories();
    }, [loadMemories])
  );

  const handleAddMemory = async () => {
    if (!newFact.trim()) return;
    await MemoryRepository.addMemory(category, "User", "noted", newFact.trim());
    setNewFact("");
    setAddSheet(false);
    await loadMemories();
  };

  const handleDelete = async (id: string) => {
    await MemoryRepository.deleteMemory(id);
    await loadMemories();
  };

  const handleClearAll = async () => {
    await MemoryRepository.clearAll();
    setClearSheet(false);
    await loadMemories();
  };

  const filtered = memories.filter((m) =>
    m.object.toLowerCase().includes(search.toLowerCase().trim())
  );

  return (
    <View style={s.root}>
      <ScreenHeader title="Personal Memory" />
      <KeyboardAwareScrollView
        contentContainerStyle={[s.content, { paddingBottom: insets.bottom + 24 }]}
        bottomOffset={24}
      >
        <View style={s.hero} testID="memory-hero">
          <View style={[s.bigDot, { backgroundColor: colors.accent }]} />
          <View style={{ flex: 1 }}>
            <Text style={s.heroTitle} testID="memory-count-title">
              {memories.length} {memories.length === 1 ? "Fact Remembered" : "Facts Remembered"}
            </Text>
            <Text style={s.heroSub}>
              Information you ask the assistant to remember is stored only on this device and used to personalize responses.
            </Text>
          </View>
        </View>

        <View style={s.actionRow}>
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Search saved memories..."
            placeholderTextColor={colors.muted}
            style={s.searchInput}
            testID="search-memories-input"
          />
          <Pressable style={s.addBtn} onPress={() => setAddSheet(true)} testID="add-memory-button">
            <Icon name="add" size={20} color="#ffffff" />
            <Text style={s.addBtnText}>Add</Text>
          </Pressable>
        </View>

        <Section title="Remembered Information" footer="Say 'Remember that...' during any voice conversation to automatically save personal context.">
          {filtered.length === 0 ? (
            <View style={s.emptyBox}>
              <Text style={s.emptyText}>
                {search ? "No matching memories found." : "No memories saved yet. Tap 'Add' to teach your assistant personal preferences."}
              </Text>
            </View>
          ) : (
            filtered.map((m, idx) => (
              <Row
                key={m.id}
                icon="bookmark-outline"
                title={m.object}
                subtitle={`${m.category.toUpperCase()} · ${new Date(m.createdAt).toLocaleDateString()}`}
                onPress={() => handleDelete(m.id)}
                last={idx === filtered.length - 1}
                testID={`memory-row-${m.id}`}
              />
            ))
          )}
        </Section>

        {memories.length > 0 && (
          <Section title="Data Privacy">
            <Row
              icon="trash-outline"
              title="Forget all memories"
              subtitle="Permanently wipes all saved facts and personal context"
              danger
              onPress={() => setClearSheet(true)}
              last
              testID="clear-all-memories-row"
            />
          </Section>
        )}
      </KeyboardAwareScrollView>

      {/* Add Memory Modal */}
      <Sheet visible={addSheet} onClose={() => setAddSheet(false)} title="Add to Personal Memory" testID="add-memory-sheet">
        <Text style={s.modalSub}>Teach your assistant a personal fact, preference, or nickname.</Text>
        <TextInput
          value={newFact}
          onChangeText={setNewFact}
          placeholder="e.g. My preferred coffee is oat milk latte"
          placeholderTextColor={colors.muted}
          style={s.modalInput}
          multiline
          testID="new-memory-input"
        />
        <View style={s.chipRow}>
          {(["fact", "preference", "contact_alias"] as UserMemory["category"][]).map((cat) => (
            <Pressable
              key={cat}
              onPress={() => setCategory(cat)}
              style={[s.chip, category === cat && s.chipActive]}
              testID={`category-chip-${cat}`}
            >
              <Text style={[s.chipText, category === cat && s.chipTextActive]}>
                {cat.replace("_", " ")}
              </Text>
            </Pressable>
          ))}
        </View>
        <SheetButton label="Save Memory" onPress={handleAddMemory} testID="save-memory-submit" />
        <SheetButton label="Cancel" tone="ghost" onPress={() => setAddSheet(false)} testID="cancel-memory-submit" />
      </Sheet>

      {/* Clear Memories Modal */}
      <Sheet visible={clearSheet} onClose={() => setClearSheet(false)} title="Forget all memories?" testID="clear-memories-sheet">
        <Text style={s.modalSub}>
          This will permanently delete all remembered personal facts, contact aliases, and preferences stored on this device.
        </Text>
        <SheetButton label="Forget Everything" tone="danger" onPress={handleClearAll} testID="confirm-clear-memories" />
        <SheetButton label="Cancel" tone="ghost" onPress={() => setClearSheet(false)} testID="cancel-clear-memories" />
      </Sheet>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  content: { paddingHorizontal: 20, paddingTop: 8 },
  hero: { flexDirection: "row", gap: 14, alignItems: "flex-start", paddingVertical: 20, marginBottom: 8 },
  bigDot: { width: 14, height: 14, borderRadius: 7, marginTop: 4 },
  heroTitle: { fontSize: 18, fontWeight: "600", color: c.onSurface },
  heroSub: { fontSize: 13, color: c.muted, marginTop: 4, lineHeight: 18 },
  actionRow: { flexDirection: "row", gap: 10, alignItems: "center", marginBottom: 16 },
  searchInput: {
    flex: 1,
    backgroundColor: c.surfaceSecondary,
    color: c.onSurface,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: c.border,
    fontSize: 14,
  },
  addBtn: {
    backgroundColor: c.brand,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  addBtnText: { color: "#ffffff", fontWeight: "600", fontSize: 14 },
  emptyBox: { paddingVertical: 24, paddingHorizontal: 16, alignItems: "center" },
  emptyText: { color: c.muted, fontSize: 14, textAlign: "center", lineHeight: 20 },
  modalSub: { color: c.muted, fontSize: 13, marginBottom: 14, lineHeight: 18 },
  modalInput: {
    backgroundColor: c.surfaceSecondary,
    color: c.onSurface,
    borderRadius: 10,
    padding: 14,
    borderWidth: 1,
    borderColor: c.border,
    fontSize: 14,
    minHeight: 80,
    textAlignVertical: "top",
    marginBottom: 14,
  },
  chipRow: { flexDirection: "row", gap: 8, marginBottom: 18 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: c.surfaceSecondary,
    borderWidth: 1,
    borderColor: c.border,
  },
  chipActive: { borderColor: c.brand, backgroundColor: c.brandSecondary },
  chipText: { fontSize: 12, color: c.muted, textTransform: "capitalize" },
  chipTextActive: { color: c.brandPrimary, fontWeight: "600" },
}));
