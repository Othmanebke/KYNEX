import { useMemo, useRef, useState } from "react";
import { ScrollView, StyleSheet, useWindowDimensions, View } from "react-native";
import { router } from "expo-router";
import { getDiscipline, getGenerator, listDisciplines, WEEKDAYS, type ScheduledSession, type Weekday } from "@kynex/core";
import { useProfile } from "@/data/profile";
import { useJournal } from "@/data/journal";
import { completedPlanned } from "@/data/journal-core";
import { useWeek } from "@/data/week";
import { WellnessSheet } from "@/features/wellness/WellnessSheet";
import { ConflictCard, DayBlock, DayStrip, Gauges, UndoBar } from "@/features/week/components";
import { SessionSheet } from "@/features/week/SessionSheet";
import { dateOfDay, findSession, isoDate, mondayOf, readableNotes, sortConflicts, todayWeekday, weekGauges, weekRangeLabel } from "@/features/week/week";
import { Button } from "@/ui/Button";
import { COVERAGE } from "@/ui/coverage";
import { Screen } from "@/ui/Screen";
import { Text } from "@/ui/Text";
import { colors, radius, space } from "@/ui/tokens";

export default function Semaine() {
  const { profile } = useProfile();
  const week = useWeek();
  const { width } = useWindowDimensions();
  const columns = width >= 1100;
  const [openId, setOpenId] = useState<string | null>(null);
  const [allNotes, setAllNotes] = useState(false);
  const [wellness, setWellness] = useState(false);
  const j = useJournal();
  const scrollRef = useRef<ScrollView | null>(null);
  const dayY = useRef<Partial<Record<Weekday, number>>>({});
  const daysTop = useRef(0);

  const { schedule, monday } = week;
  const now = new Date();
  const today = isoDate(monday) === isoDate(mondayOf(now)) ? todayWeekday(now) : null;
  const dates = useMemo(() => Object.fromEntries(WEEKDAYS.map((d) => [d, dateOfDay(monday, d)])) as Record<Weekday, Date>, [monday]);
  const conflicts = useMemo(() => sortConflicts(schedule.conflicts), [schedule]);
  const gauges = useMemo(() => (profile ? weekGauges(schedule, profile) : null), [schedule, profile]);
  const doneIds = useMemo(() => completedPlanned(schedule, j.journal.results), [schedule, j.journal.results]);
  if (!profile || !gauges) return null;

  const untracked = profile.disciplines.filter((d) => !["full", "beta"].includes(getDiscipline(d.disciplineId).coverage));
  const errors = conflicts.filter((c) => c.severity === "error").length;
  const notes = readableNotes(schedule.notes, (name, v) => {
    const id = listDisciplines().find((d) => d.name === name)?.id;
    return id ? getGenerator(id)?.variants[v] : undefined;
  });
  const nothingPlanned = gauges.sessions === 0;
  // Jours de repos choisis parmi les jours disponibles (un jour non déclaré reste « indisponible »).
  const restDays = profile.preferredRestDays.filter((d) => profile.availability.some((a) => a.day === d));
  const open: ScheduledSession | null = openId ? (findSession(schedule, openId) ?? null) : null;

  const days = (
    <View
      style={columns ? styles.grid : styles.list}
      onLayout={(e) => {
        daysTop.current = e.nativeEvent.layout.y;
      }}
    >
      {schedule.days.map((d) => (
        <View
          key={d.day}
          style={columns ? styles.col : undefined}
          onLayout={(e) => {
            dayY.current[d.day] = e.nativeEvent.layout.y;
          }}
        >
          <DayBlock d={d} doneIds={doneIds} restPreferred={restDays.includes(d.day)} date={dates[d.day]} isToday={d.day === today} conflicts={schedule.conflicts} onSession={(s) => router.push({ pathname: "/seance/[id]", params: { id: s.id } })} onOptions={(s) => setOpenId(s.id)} compact={columns} />
        </View>
      ))}
    </View>
  );

  return (
    <>
      <Screen maxWidth={columns ? 1320 : 640} scrollRef={scrollRef}>
        <View style={styles.top}>
          <Text variant="title">KYNEX</Text>
          <Text variant="small" color={colors.muted} numberOfLines={1} style={styles.accountTxt}>
            {j.pendingSync ? `${j.pendingSync} en attente de synchro` : "Enregistré sur cet appareil"}
          </Text>
        </View>

        <View style={styles.hero}>
          <Text variant="display" accessibilityRole="header">
            Semaine {week.weekIndex + 1}
          </Text>
          <Text variant="mono" color={colors.fg}>
            {weekRangeLabel(monday)}
          </Text>
          <Text variant="body" color={colors.muted}>
            {gauges.sessions} séance{gauges.sessions > 1 ? "s" : ""} ·{" "}
            {conflicts.length === 0 ? "aucun conflit" : `${conflicts.length} conflit${conflicts.length > 1 ? "s" : ""}${errors ? ` dont ${errors} à corriger` : ""}`}
          </Text>
        </View>

        <View style={styles.heroActions}>
          {j.live && (j.live.status === "running" || j.live.status === "paused") && j.live.plannedSessionId ? (
            <Button label={`Reprendre : ${j.live.plan.title}`} arrow onPress={() => router.push({ pathname: "/live/[id]", params: { id: j.live!.plannedSessionId! } })} />
          ) : null}
          <Button kind="secondary" label="Fatigue ou douleur" hint="Adapte la semaine sans pénalité" onPress={() => setWellness(true)} />
        </View>

        {week.regenerated ? (
          <View style={styles.info}>
            <Text variant="small">Ton profil a changé : la semaine a été recalculée.</Text>
          </View>
        ) : null}

        <View style={[styles.overview, columns && styles.overviewWide]}>
          <View style={[styles.overviewMain, columns && styles.flex]}>
            <Gauges g={gauges} />
            {columns ? null : (
              <DayStrip
                days={schedule.days}
                today={today}
                dates={dates}
                restDays={restDays}
                onPick={(d) => scrollRef.current?.scrollTo({ y: daysTop.current + (dayY.current[d] ?? 0) - 8, animated: true })}
              />
            )}
            {notes.length || untracked.length ? (
              <View style={styles.notes}>
                <Text variant="label" color={colors.muted}>
                  Choix du plan
                </Text>
                {untracked.length ? (
                  <Text variant="small" color={colors.muted}>
                    · Non programmées ({untracked.map((d) => COVERAGE[getDiscipline(d.disciplineId).coverage].label.toLowerCase()).filter((v, i, a) => a.indexOf(v) === i).join(", ")}) :{" "}
                    {untracked.map((d) => getDiscipline(d.disciplineId).name).join(", ")}.
                  </Text>
                ) : null}
                {(allNotes ? notes : notes.slice(0, 3)).map((n, i) => (
                  <Text key={i} variant="small" color={colors.muted}>
                    · {n}
                  </Text>
                ))}
                {notes.length > 3 ? (
                  <Button kind="link" label={allNotes ? "Réduire" : `Afficher les ${notes.length - 3} autres`} onPress={() => setAllNotes((v) => !v)} />
                ) : null}

              </View>
            ) : null}
          </View>

          {conflicts.length ? (
            <View style={[styles.conflicts, columns && styles.flex]}>
              <Text variant="label" color={colors.muted} accessibilityRole="header">
                Conflits
              </Text>
              {conflicts.map((c, i) => (
                <ConflictCard key={`${c.code}-${c.days.join("")}-${i}`} c={c} index={i} schedule={schedule} onApply={(j) => week.applySuggestion(c.suggestions[j]!)} />
              ))}
            </View>
          ) : null}
        </View>

        {nothingPlanned ? (
          <View style={styles.empty}>
            <Text variant="title">Rien à programmer cette semaine</Text>
            <Text variant="body" color={colors.muted}>
              {untracked.length === profile.disciplines.length
                ? "Tes disciplines sont en suivi seul ou en séance libre : l'app ne génère pas de séances pour elles. Tu pourras noter tes séances dans l'historique."
                : "Tes disponibilités sont trop courtes pour placer une séance. Allonge un ou plusieurs jours dans ton profil."}
            </Text>
            <Button kind="secondary" label="Modifier mon profil" onPress={() => router.push("/creation-profil")} />
          </View>
        ) : null}

        {days}
        {/* Place sous la dernière séance quand la barre « Annuler » est affichée : rien ne reste caché dessous. */}
        {week.lastAction ? <View style={styles.undoSpace} /> : null}
      </Screen>

      {week.lastAction ? (
        <View style={styles.undoWrap} pointerEvents="box-none">
          <View style={styles.undoInner}>
            <UndoBar label={week.lastAction} canUndo={week.canUndo} onUndo={week.undo} onDismiss={week.dismissNotice} />
          </View>
        </View>
      ) : null}

      <SessionSheet
        session={open}
        schedule={schedule}
        profile={profile}
        onClose={() => setOpenId(null)}
        onMove={week.move}
        onDowngrade={week.downgrade}
        onRemove={week.remove}
      />

      <WellnessSheet
        visible={wellness}
        onClose={() => setWellness(false)}
        defaultDay={today ?? "mon"}
        onApply={(signal) => week.applyWellness(signal)}
      />

    </>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  top: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: space.md },
  accountBtn: { flexDirection: "row", alignItems: "center", gap: space.sm, paddingHorizontal: space.sm, maxWidth: 280 },
  accountTxt: { flexShrink: 1, minWidth: 0 },
  noShrink: { flexShrink: 0 },
  accountSlot: { flexShrink: 1, minWidth: 0 },
  hero: { gap: space.xs },
  heroActions: { gap: space.sm, flexDirection: "row", flexWrap: "wrap" },
  info: { backgroundColor: colors.surface, borderRadius: radius.md, padding: space.md, borderWidth: 1, borderColor: colors.line },
  overview: { gap: space.lg },
  overviewWide: { flexDirection: "row", alignItems: "flex-start", gap: space.xl },
  overviewMain: { gap: space.lg },
  notes: { gap: 4 },
  conflicts: { gap: space.sm },
  list: { gap: space.xl },
  empty: { gap: space.md, backgroundColor: colors.surface, borderRadius: radius.lg, padding: space.xl, borderWidth: 1, borderColor: colors.line },
  grid: { flexDirection: "row", gap: space.sm, alignItems: "flex-start" },
  col: { flex: 1, minWidth: 0 },
  undoWrap: { position: "absolute", left: 0, right: 0, bottom: __DEV__ ? 56 : 16, alignItems: "center", paddingHorizontal: space.lg },
  undoInner: { width: "100%", maxWidth: 560 },
  undoSpace: { height: 72 },
});
