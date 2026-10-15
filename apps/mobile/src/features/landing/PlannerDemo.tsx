import { useMemo, useState } from "react";
import { StyleSheet, View } from "react-native";
import { getDiscipline, parseProfile, planWeek, WEEKDAYS, type Weekday } from "@kynex/core";
import { familyColor } from "@/features/week/components";
import { frenchDays, readableNotes, sortConflicts, weekGauges } from "@/features/week/week";
import { Chip } from "@/ui/Chip";
import { DAY_LABEL, formatMinutes } from "@/ui/labels";
import { Segmented } from "@/ui/Segmented";
import { Text } from "@/ui/Text";
import { colors, radius, space } from "@/ui/tokens";

const CHOICES = ["strength_training", "running", "hiit", "calisthenics", "mobility"] as const;
const DAY_SETS: Record<3 | 4 | 5, Weekday[]> = { 3: ["mon", "wed", "sat"], 4: ["mon", "tue", "thu", "sat"], 5: ["mon", "tue", "thu", "sat", "sun"] };

/**
 * Démo interactive : le vrai planificateur du socle tourne dans le navigateur.
 * Rien n'est précalculé ni inventé : chaque clic relance planWeek.
 */
export function PlannerDemo({ compact }: { compact?: boolean }) {
  const [picked, setPicked] = useState<string[]>(["strength_training", "running", "mobility"]);
  const [days, setDays] = useState<3 | 4 | 5>(4);

  const result = useMemo(() => {
    if (!picked.length) return null;
    const profile = parseProfile({
      userId: "landing-demo",
      disciplines: picked.map((id, i) => ({ disciplineId: id, level: "intermediate", priority: Math.min(3, i + 1) as 1 | 2 | 3 })),
      goals: ["general_fitness"],
      equipment: ["barbell", "dumbbells", "bench", "squat_rack", "pullup_bar", "parallel_bars", "kettlebell", "mat"],
      environments: ["gym", "outdoor", "street_workout_park", "home_no_equipment"],
      availability: DAY_SETS[days].map((day) => ({ day, maxMinutes: 60 })),
    });
    const week = planWeek(profile);
    return { week, gauges: weekGauges(week, profile) };
  }, [picked, days]);

  return (
    <View style={styles.wrap}>
      <View style={styles.controls}>
        <Text variant="label" color={colors.muted}>
          Tes sports
        </Text>
        <View style={styles.chips}>
          {CHOICES.map((id) => (
            <View key={id} style={compact ? styles.chipFull : styles.chip}>
              <Chip
                label={getDiscipline(id).name}
                dot={familyColor(id)}
                selected={picked.includes(id)}
                onToggle={() => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]))}
              />
            </View>
          ))}
        </View>
        <Text variant="label" color={colors.muted}>
          Jours disponibles (1 h chacun)
        </Text>
        <Segmented<3 | 4 | 5>
          label="Jours disponibles"
          value={days}
          onChange={setDays}
          options={[
            { value: 3, label: "3 jours" },
            { value: 4, label: "4 jours" },
            { value: 5, label: "5 jours" },
          ]}
        />
      </View>

      <View style={styles.out} accessibilityLiveRegion="polite">
        {!result ? (
          <Text variant="body" color={colors.muted}>
            Choisis au moins un sport pour voir ta semaine.
          </Text>
        ) : (
          <>
            <Text variant="monoSmall" color={colors.muted}>
              {result.gauges.sessions} SÉANCES · {formatMinutes(result.gauges.plannedMinutes).toUpperCase()} · {result.week.conflicts.length ? `${result.week.conflicts.length} CONFLIT${result.week.conflicts.length > 1 ? "S" : ""}` : "AUCUN CONFLIT"}
            </Text>
            <View style={styles.days}>
              {WEEKDAYS.map((d) => {
                const day = result.week.days.find((x) => x.day === d)!;
                return (
                  <View key={d} style={styles.dayRow}>
                    <Text variant="mono" color={colors.muted} style={styles.dayLabel}>
                      {DAY_LABEL[d].short}
                    </Text>
                    <View style={styles.flex}>
                      {day.sessions.length ? (
                        day.sessions.map((s) => (
                          <View key={s.id} style={styles.session}>
                            <View style={[styles.dot, { backgroundColor: familyColor(s.disciplineId) }]} />
                            <Text variant="small" style={styles.flex}>
                              {s.plan.title}
                            </Text>
                            <Text variant="monoSmall" color={colors.muted}>
                              {s.plan.estimatedMinutes} min
                            </Text>
                          </View>
                        ))
                      ) : (
                        <Text variant="small" color={colors.faint}>
                          {day.available ? "Récupération" : "Repos"}
                        </Text>
                      )}
                    </View>
                  </View>
                );
              })}
            </View>
            {sortConflicts(result.week.conflicts)
              .slice(0, 1)
              .map((c, i) => (
                <Text key={i} variant="small" color={colors.warning}>
                  {frenchDays(c.message)}
                </Text>
              ))}
            {readableNotes(result.week.notes, () => undefined)
              .slice(0, 2)
              .map((n, i) => (
                <Text key={i} variant="small" color={colors.muted}>
                  {n}
                </Text>
              ))}
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  wrap: { gap: space.xl },
  controls: { gap: space.sm },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  chip: { flexBasis: "48%", flexGrow: 1, minWidth: 0 },
  chipFull: { width: "100%" },
  out: { gap: space.md, backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, padding: space.lg },
  days: { gap: 2 },
  dayRow: { flexDirection: "row", gap: space.md, paddingVertical: space.sm, borderBottomWidth: 1, borderBottomColor: colors.line, alignItems: "flex-start" },
  dayLabel: { width: 40 },
  session: { flexDirection: "row", alignItems: "center", gap: space.sm },
  dot: { width: 8, height: 8, borderRadius: 4 },
});
