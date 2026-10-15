import { useMemo, useState } from "react";
import { ScrollView, StyleSheet, useWindowDimensions, View } from "react-native";
import { router } from "expo-router";
import { commonStats, disciplineStats, findExercise, getDiscipline, type SessionResult } from "@kynex/core";
import { useJournal } from "@/data/journal";
import { useProfile } from "@/data/profile";
import { dayLabel, disciplineName, groupByDay, recordLabel, recordValue, resultSummary, STATUS_LABEL, weeklyCounts } from "@/features/history/history";
import { ManualEntrySheet } from "@/features/history/ManualEntrySheet";
import { formatDistance, formatPace } from "@/features/session/blocks";
import { familyColor, Tag } from "@/features/week/components";
import { Button } from "@/ui/Button";
import { Chip } from "@/ui/Chip";
import { COVERAGE } from "@/ui/coverage";
import { formatMinutes } from "@/ui/labels";
import { PressScale } from "@/ui/Pressable";
import { Screen } from "@/ui/Screen";
import { Sheet } from "@/ui/Sheet";
import { Text } from "@/ui/Text";
import { colors, radius, space } from "@/ui/tokens";

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <View style={styles.stat} accessible accessibilityLabel={`${label} : ${value}${hint ? `. ${hint}` : ""}`}>
      <Text variant="monoSmall" color={colors.muted}>
        {label.toUpperCase()}
      </Text>
      <Text variant="title">{value}</Text>
      {hint ? (
        <Text variant="small" color={colors.muted}>
          {hint}
        </Text>
      ) : null}
    </View>
  );
}

/** Séances réalisées par semaine : barres à l'échelle, chiffre au-dessus, résumé lu au lecteur d'écran. */
function WeeklyBars({ data }: { data: { weekStart: string; count: number; label: string }[] }) {
  const max = Math.max(1, ...data.map((d) => d.count));
  const total = data.reduce((n, d) => n + d.count, 0);
  return (
    <View style={styles.chart} accessible accessibilityLabel={`Séances réalisées sur 8 semaines : ${total}. Cette semaine : ${data.at(-1)?.count ?? 0}.`}>
      <Text variant="label" color={colors.muted}>
        Séances par semaine
      </Text>
      <View style={styles.bars}>
        {data.map((d, i) => (
          <View key={d.weekStart} style={styles.barCol}>
            <Text variant="monoSmall" color={d.count ? colors.fg : colors.faint}>
              {d.count}
            </Text>
            <View style={styles.barTrack}>
              <View style={[styles.bar, { height: `${(d.count / max) * 100}%` }, i === data.length - 1 && styles.barNow]} />
            </View>
            <Text variant="monoSmall" color={colors.faint}>
              {d.label}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function DisciplineStatsCard({ id, results }: { id: string; results: SessionResult[] }) {
  const s = disciplineStats(id, results);
  const rows: [string, string][] = [];
  if (s?.model === "resistance") {
    rows.push(["Séries", `${s.totalSets}`], ["Répétitions", `${s.totalReps}`], ["Tonnage", s.volumeKg !== undefined ? `${Math.round(s.volumeKg).toLocaleString("fr-FR")} kg` : "non calculé : charges manquantes"]);
  } else if (s?.model === "endurance") {
    rows.push(["Distance", s.totalDistanceM !== undefined ? formatDistance(s.totalDistanceM) : "non mesurée"], ["Allure moyenne", s.avgPaceSecPerKm !== undefined ? formatPace(s.avgPaceSecPerKm) : "non mesurée"]);
    if (s.totalElevationM !== undefined) rows.push(["Dénivelé positif", `${s.totalElevationM} m`]);
  } else if (s?.model === "skill") {
    rows.push(["Répétitions", `${s.totalReps}`], ["Compétences validées", `${s.skillsAchieved.length}`]);
  } else if (s?.model === "practice") {
    for (const [p, n] of Object.entries(s.practices).slice(0, 5)) rows.push([findExercise(p)?.name ?? p, `${n} fois`]);
  } else if (s?.model === "wod") {
    for (const [f, n] of Object.entries(s.byFormat)) rows.push([f.toUpperCase(), `${n}`]);
  }
  return (
    <View style={styles.card}>
      <Text variant="label" color={colors.muted}>
        {disciplineName(id)}
      </Text>
      {rows.length ? (
        rows.map(([k, v]) => (
          <View key={k} style={styles.kv}>
            <Text variant="small" color={colors.muted} style={styles.flex}>
              {k}
            </Text>
            <Text variant="mono" style={styles.kvValue}>
              {v}
            </Text>
          </View>
        ))
      ) : (
        <Text variant="small" color={colors.muted}>
          Pas encore de mesures pour cette discipline : les statistiques apparaîtront avec tes séances saisies.
        </Text>
      )}
    </View>
  );
}

function ResultDetail({ r }: { r: SessionResult }) {
  const m = r.metrics;
  return (
    <View style={styles.detail}>
      <Text variant="mono" color={colors.muted}>
        {STATUS_LABEL[r.status]} · {resultSummary(r).join(" · ")}
      </Text>
      {r.painReported ? <Tag label="Douleur signalée" color={colors.warning} /> : null}
      {m?.model === "resistance"
        ? m.exercises.map((e) => (
            <View key={e.exerciseId} style={styles.exBlock}>
              <Text variant="bodyStrong">{findExercise(e.exerciseId)?.name ?? e.exerciseId}</Text>
              {e.sets.map((s, i) => (
                <Text key={i} variant="mono" color={colors.muted}>
                  Série {i + 1} : {s.reps} rép. · {s.loadKg !== undefined ? `${s.loadKg.toLocaleString("fr-FR")} kg` : "charge non saisie"}
                  {s.rpe ? ` · RPE ${s.rpe}` : ""}
                </Text>
              ))}
            </View>
          ))
        : null}
      {m?.model === "endurance" ? (
        <Text variant="mono" color={colors.muted}>
          {m.distanceM !== undefined ? formatDistance(m.distanceM) : "distance non mesurée"}
          {m.distanceM !== undefined && m.durationSec ? ` · ${formatPace(Math.round(m.durationSec / (m.distanceM / 1000)))}` : ""}
        </Text>
      ) : null}
      {!m && r.status !== "skipped" ? (
        <Text variant="small" color={colors.muted}>
          Aucune mesure saisie : la séance compte pour ta régularité, mais n'alimente pas les statistiques.
        </Text>
      ) : null}
    </View>
  );
}

export default function Historique() {
  const { journal, addManual } = useJournal();
  const { profile } = useProfile();
  const { width } = useWindowDimensions();
  const wide = width >= 1100;
  const [filter, setFilter] = useState<string | null>(null);
  const [manual, setManual] = useState(false);
  const [open, setOpen] = useState<SessionResult | null>(null);
  const now = new Date();

  const all = journal.results;
  const results = useMemo(() => (filter ? all.filter((r) => r.disciplineId === filter) : all), [all, filter]);
  const disciplineIds = useMemo(
    () => [...new Set([...(profile?.disciplines.map((d) => d.disciplineId) ?? []), ...all.map((r) => r.disciplineId)])],
    [profile, all],
  );
  const stats = commonStats(results);
  const weekly = weeklyCounts(results, now);
  const records = journal.records.filter((r) => !filter || r.disciplineId === filter).sort((a, b) => b.date.localeCompare(a.date));
  const groups = groupByDay(results);

  const side = (
    <View style={styles.side}>
      <View style={styles.stats}>
        <Stat label="Séances" value={`${stats.sessionsCompleted}`} />
        <Stat
          label="Temps mesuré"
          value={stats.measuredDurationSec ? formatMinutes(Math.round(stats.measuredDurationSec / 60)) : "—"}
          hint={stats.sessionsWithoutDuration ? `${stats.sessionsWithoutDuration} séance${stats.sessionsWithoutDuration > 1 ? "s" : ""} sans durée mesurée` : undefined}
        />
      </View>
      <WeeklyBars data={weekly} />
      {filter ? <DisciplineStatsCard id={filter} results={results} /> : null}
      <View style={styles.card}>
        <Text variant="label" color={colors.muted}>
          Records personnels
        </Text>
        {records.length ? (
          records.slice(0, 8).map((r) => (
            <View key={r.key} style={styles.kv}>
              <Text variant="small" style={styles.flex}>
                {recordLabel(r)}
              </Text>
              <Text variant="mono" color={colors.accent} style={styles.kvValue}>
                {recordValue(r)}
              </Text>
            </View>
          ))
        ) : (
          <Text variant="small" color={colors.muted}>
            Tes records apparaîtront quand tu saisiras tes charges, répétitions ou distances.
          </Text>
        )}
      </View>
    </View>
  );

  return (
    <>
      <Screen maxWidth={wide ? 1200 : 640}>
        <View style={styles.head}>
          <Text variant="display" accessibilityRole="header">
            Historique
          </Text>
          <View style={wide ? styles.cta : undefined}>
            <Button label="Noter une séance" hint="Pour une séance faite sans l'app ou une discipline en suivi seul" onPress={() => setManual(true)} />
          </View>
        </View>

        {disciplineIds.length > 1 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterBar} contentContainerStyle={styles.filters}>
            <Chip role="radio" label="Toutes" selected={filter === null} onToggle={() => setFilter(null)} />
            {disciplineIds.map((id) => (
              <Chip key={id} role="radio" label={getDiscipline(id).name} dot={familyColor(id)} selected={filter === id} onToggle={() => setFilter(filter === id ? null : id)} />
            ))}
          </ScrollView>
        ) : null}

        <View style={[styles.layout, wide && styles.layoutWide]}>
          {wide ? null : side}
          <View style={[styles.list, wide && styles.flex]}>
            {groups.length === 0 ? (
              <View style={styles.empty}>
                <Text variant="title">Aucune séance pour l'instant</Text>
                <Text variant="body" color={colors.muted}>
                  Termine une séance de ta semaine ou note une séance faite sans l'app : elle apparaîtra ici.
                </Text>
                <Button kind="secondary" label="Voir ma semaine" onPress={() => router.navigate("/")} />
              </View>
            ) : (
              groups.map((g) => (
                <View key={g.date} style={styles.group}>
                  <Text variant="headline" accessibilityRole="header">
                    {dayLabel(g.date, now)}
                  </Text>
                  {g.items.map((r) => {
                    const d = getDiscipline(r.disciplineId);
                    return (
                      <PressScale
                        key={r.id}
                        accessibilityRole="button"
                        accessibilityLabel={`${d.name}, ${STATUS_LABEL[r.status]}, ${resultSummary(r).join(", ")}`}
                        onPress={() => setOpen(r)}
                        style={styles.result}
                      >
                        <View style={styles.resultHead}>
                          <View style={[styles.dot, { backgroundColor: familyColor(r.disciplineId) }]} />
                          <Text variant="bodyStrong" style={styles.flex}>
                            {d.name}
                          </Text>
                          {r.status === "partial" ? <Tag label="Partielle" color={colors.muted} /> : null}
                          {!r.plannedSessionId ? <Tag label="Hors plan" color={COVERAGE[d.coverage].color} /> : null}
                        </View>
                        <Text variant="monoSmall" color={colors.muted}>
                          {resultSummary(r).join(" · ").toUpperCase()}
                        </Text>
                      </PressScale>
                    );
                  })}
                </View>
              ))
            )}
          </View>
          {wide ? <View style={styles.sideWide}>{side}</View> : null}
        </View>
      </Screen>

      <ManualEntrySheet visible={manual} onClose={() => setManual(false)} disciplineIds={disciplineIds} onSave={(input) => addManual(input)} />
      <Sheet visible={open !== null} onClose={() => setOpen(null)} title={open ? disciplineName(open.disciplineId) : ""}>
        {open ? <ResultDetail r={open} /> : null}
      </Sheet>
    </>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  head: { gap: space.md },
  // flexGrow 0 : la rangée horizontale garde la hauteur de ses puces.
  filterBar: { flexGrow: 0 },
  filters: { gap: space.sm, paddingRight: space.lg, alignItems: "center" },
  cta: { alignSelf: "flex-start", minWidth: 260 },
  layout: { gap: space.xl },
  layoutWide: { flexDirection: "row", alignItems: "flex-start", gap: space.xxl },
  side: { gap: space.lg },
  sideWide: { width: 380 },
  stats: { flexDirection: "row", gap: space.md, flexWrap: "wrap" },
  stat: { flex: 1, minWidth: 140, gap: 2, padding: space.lg, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line },
  chart: { gap: space.md, padding: space.lg, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line },
  bars: { flexDirection: "row", gap: space.xs, alignItems: "flex-end" },
  barCol: { flex: 1, minWidth: 0, alignItems: "center", gap: 4 },
  barTrack: { width: "100%", height: 96, justifyContent: "flex-end" },
  bar: { width: "100%", minHeight: 2, borderRadius: 4, backgroundColor: colors.line },
  barNow: { backgroundColor: colors.accent },
  card: { gap: space.sm, padding: space.lg, borderRadius: radius.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line },
  kv: { flexDirection: "row", alignItems: "baseline", gap: space.md, flexWrap: "wrap" },
  kvValue: { textAlign: "right" },
  list: { gap: space.xl },
  group: { gap: space.sm },
  result: { gap: 4, padding: space.md, borderRadius: radius.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line },
  resultHead: { flexDirection: "row", alignItems: "center", gap: space.sm, flexWrap: "wrap" },
  dot: { width: 8, height: 8, borderRadius: 4 },
  empty: { gap: space.md, padding: space.xl, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line },
  detail: { gap: space.md },
  exBlock: { gap: 2 },
});
