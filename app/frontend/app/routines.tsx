import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { KeyboardAwareScrollView } from "@/src/components/common/SafeKeyboard";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Icon } from "@/src/components/common/Icon";
import { Row, Section } from "@/src/components/common/Row";
import { ScreenHeader } from "@/src/components/common/ScreenHeader";
import { Sheet, SheetButton } from "@/src/components/common/Sheet";
import { DailyBriefingService } from "@/src/services/agent/DailyBriefingService";
import { RoutineRepository, type PersonalRoutine } from "@/src/services/storage/RoutineRepository";
import { useSettings } from "@/src/store/settings";
import { makeStyles, useTheme } from "@/src/theme";

export default function RoutinesScreen() {
  const s = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { settings } = useSettings();

  const [routines, setRoutines] = useState<PersonalRoutine[]>([]);
  const [briefingOutput, setBriefingOutput] = useState<string | null>(null);
  const [running, setRunning] = useState(false);

  const loadRoutines = useCallback(async () => {
    try {
      const list = await RoutineRepository.listRoutines();
      setRoutines(list);
    } catch {
      setRoutines([]);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadRoutines();
    }, [loadRoutines])
  );

  const handleToggle = async (id: string, enabled: boolean) => {
    await RoutineRepository.toggleRoutine(id, enabled);
    await loadRoutines();
  };

  const handleRunBriefing = async () => {
    setRunning(true);
    const result = await DailyBriefingService.generateBriefing(settings.name);
    setRunning(false);
    setBriefingOutput(result);
  };

  return (
    <View style={s.root}>
      <ScreenHeader title="Automations & Routines" />
      <KeyboardAwareScrollView
        contentContainerStyle={[s.content, { paddingBottom: insets.bottom + 24 }]}
        bottomOffset={24}
      >
        <View style={s.hero} testID="routines-hero">
          <View style={[s.bigDot, { backgroundColor: colors.brand }]} />
          <View style={{ flex: 1 }}>
            <Text style={s.heroTitle} testID="routines-title">Personal Routines</Text>
            <Text style={s.heroSub}>
              Automate morning briefings, evening summaries, and device actions on a scheduled or event-driven basis.
            </Text>
          </View>
        </View>

        {/* Quick Action: Trigger Briefing */}
        <Pressable
          style={[s.briefingCard, running && s.briefingCardActive]}
          onPress={handleRunBriefing}
          disabled={running}
          testID="trigger-briefing-button"
        >
          <View style={s.briefingIconBox}>
            <Icon name="sunny" size={24} color={colors.warning} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.briefingTitle}>
              {running ? "Synthesizing Briefing..." : "Play Daily Briefing Now"}
            </Text>
            <Text style={s.briefingSub}>Combines clock, calendar agenda, battery status & reminders.</Text>
          </View>
          <Icon name="chevron-forward" size={18} color={colors.muted} />
        </Pressable>

        <Section title="Recurring Routines" footer="Routines run automatically in the background using Android AlarmManager & WorkManager.">
          {routines.map((r, idx) => (
            <Row
              key={r.id}
              icon={r.triggerType === "morning" ? "sunny-outline" : "moon-outline"}
              title={r.title}
              subtitle={`${r.timeSpec} · ${r.days}`}
              switchValue={r.enabled}
              onSwitch={(v) => handleToggle(r.id, v)}
              last={idx === routines.length - 1}
              testID={`routine-toggle-${r.id}`}
            />
          ))}
        </Section>
      </KeyboardAwareScrollView>

      {/* Spoken Briefing Preview Sheet */}
      <Sheet visible={briefingOutput !== null} onClose={() => setBriefingOutput(null)} title="Daily Briefing" testID="briefing-preview-sheet">
        <Text style={s.briefingBody}>{briefingOutput}</Text>
        <SheetButton label="Dismiss" tone="primary" onPress={() => setBriefingOutput(null)} testID="dismiss-briefing" />
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
  briefingCard: {
    backgroundColor: c.surfaceSecondary,
    borderRadius: 14,
    padding: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: c.border,
  },
  briefingCardActive: { borderColor: c.brand },
  briefingIconBox: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: c.surfaceTertiary,
    alignItems: "center",
    justifyContent: "center",
  },
  briefingTitle: { fontSize: 15, fontWeight: "600", color: c.onSurface },
  briefingSub: { fontSize: 12, color: c.muted, marginTop: 2, lineHeight: 16 },
  briefingBody: { fontSize: 15, color: c.onSurface, lineHeight: 22, marginVertical: 14 },
}));
