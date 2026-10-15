import { useState } from "react";
import { StyleSheet, useWindowDimensions, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { Image } from "expo-image";
import { getDiscipline, getGenerator, type TrainingLoad } from "@kynex/core";
import { exerciseImages } from "@/data/exercise-media";
import { useProfile } from "@/data/profile";
import { useJournal } from "@/data/journal";
import { useWeek } from "@/data/week";
import { describeBlock, type BlockView } from "@/features/session/blocks";
import { ExerciseSheet } from "@/features/session/ExerciseSheet";
import { familyColor, Tag } from "@/features/week/components";
import { SessionSheet } from "@/features/week/SessionSheet";
import { conflictsOf, dateOfDay, findSession, frenchDays, INTENSITY_LABEL } from "@/features/week/week";
import { Button } from "@/ui/Button";
import { COVERAGE } from "@/ui/coverage";
import { Icon } from "@/ui/Icon";
import { DAY_LABEL, formatMinutes } from "@/ui/labels";
import { PressScale } from "@/ui/Pressable";
import { Screen } from "@/ui/Screen";
import { Text } from "@/ui/Text";
import { colors, radius, space } from "@/ui/tokens";

const AXES: { key: keyof TrainingLoad; label: string }[] = [
  { key: "lowerBody", label: "Bas du corps" },
  { key: "upperBody", label: "Haut du corps" },
  { key: "cardio", label: "Cardio" },
  { key: "impact", label: "Impact" },
  { key: "cns", label: "Stress nerveux" },
];
const LEVEL_WORD = ["nulle", "légère", "moyenne", "forte"];

/** Sollicitation estimée sur les 5 axes du socle (0 à 3) : 3 segments par axe. */
function LoadProfile({ load }: { load: TrainingLoad }) {
  return (
    <View style={styles.load}>
      {AXES.map((a) => (
        <View key={a.key} style={styles.axis} accessible accessibilityLabel={`${a.label} : sollicitation ${LEVEL_WORD[load[a.key]]}`}>
          <Text variant="small" color={colors.muted} style={styles.axisLabel}>
            {a.label}
          </Text>
          <View style={styles.segs}>
            {[1, 2, 3].map((n) => (
              <View key={n} style={[styles.seg, n <= load[a.key] && styles.segOn]} />
            ))}
          </View>
        </View>
      ))}
      <Text variant="small" color={colors.faint}>
        Estimation du plan, pas une mesure.
      </Text>
    </View>
  );
}

function BlockCard({ v, index, onExercise }: { v: BlockView; index: number; onExercise: (id: string) => void }) {
  const single = v.exercises.length === 1 && v.exercises[0]!.dose === null;
  return (
    <View style={styles.block}>
      <View style={styles.blockHead}>
        <Text variant="mono" color={colors.faint} style={styles.blockNum}>
          {String(index + 1).padStart(2, "0")}
        </Text>
        <View style={styles.flex}>
          <View style={styles.titleRow}>
            <Text variant="headline" style={styles.shrink}>
              {v.title}
            </Text>
            {v.kindLabel !== v.title ? <Tag label={v.kindLabel} color={colors.muted} /> : null}
          </View>
          {v.prescription ? (
            <Text variant="mono" color={colors.accent}>
              {v.prescription}
            </Text>
          ) : null}
          {v.notes ? (
            <Text variant="small" color={colors.muted}>
              {v.notes}
            </Text>
          ) : null}
        </View>
      </View>
      {v.exercises.length ? (
        <View style={styles.exList}>
          {v.exercises.map((e, i) => {
            const thumb = exerciseImages(e.exerciseId)[0];
            return (
              <PressScale
                key={`${e.exerciseId}-${i}`}
                accessibilityRole="button"
                accessibilityLabel={`${e.name}${e.dose ? `, ${e.dose}` : ""}. Voir la fiche`}
                onPress={() => onExercise(e.exerciseId)}
                style={styles.exRow}
              >
                <View style={styles.thumb}>
                  {thumb ? <Image source={{ uri: thumb.uri }} style={StyleSheet.absoluteFill} contentFit="cover" cachePolicy="disk" /> : <Icon name="activity" size={18} color={colors.faint} />}
                </View>
                <View style={styles.flex}>
                  <Text variant="bodyStrong">{single ? "Voir la fiche de l'exercice" : e.name}</Text>
                  {e.dose ? (
                    <Text variant="mono" color={colors.muted}>
                      {e.dose}
                    </Text>
                  ) : null}
                </View>
                <Icon name="chevron-right" size={18} color={colors.muted} />
              </PressScale>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}

export default function SeanceDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const week = useWeek();
  const { profile } = useProfile();
  const { width } = useWindowDimensions();
  const wide = width >= 1000;
  const [exerciseId, setExerciseId] = useState<string | null>(null);
  const [actions, setActions] = useState(false);
  const j = useJournal();
  const session = id ? findSession(week.schedule, id) : undefined;
  const back = () => (router.canGoBack() ? router.back() : router.replace("/"));

  if (!session || !profile) {
    return (
      <Screen>
        <BackButton onPress={back} />
        <Text variant="display">Séance introuvable</Text>
        <Text variant="body" color={colors.muted}>
          Elle a peut-être été supprimée ou la semaine a été recalculée.
        </Text>
        <Button kind="secondary" label="Retour à la semaine" onPress={() => router.replace("/")} />
      </Screen>
    );
  }

  const d = getDiscipline(session.disciplineId);
  const date = dateOfDay(week.monday, session.day);
  const views = session.plan.blocks.map(describeBlock);
  const mine = conflictsOf(week.schedule.conflicts, session.id);
  const done = j.journal.results.some((r) => r.plannedSessionId === session.id && r.status !== "skipped");
  const resuming = j.live?.plannedSessionId === session.id && (j.live.status === "running" || j.live.status === "paused");
  // « focus » du socle = identifiant de variante (« upper ») : on affiche son libellé, ou rien.
  const focus = session.plan.focus ? (getGenerator(d.id)?.variants[session.plan.focus] ?? (/^[a-z0-9_]+$/.test(session.plan.focus) ? null : session.plan.focus)) : null;
  const showFocus = focus && !session.plan.title.toLowerCase().includes(focus.toLowerCase());

  const summary = (
    <View style={styles.summary}>
      <LoadProfile load={session.plan.load} />
      {mine.map((c, i) => (
        <View key={i} style={[styles.note, c.severity === "error" && styles.noteError]}>
          <Icon name={c.severity === "error" ? "alert-triangle" : "alert-circle"} size={16} color={c.severity === "error" ? colors.danger : colors.warning} />
          <Text variant="small" style={styles.flex}>
            {frenchDays(c.message)}
          </Text>
        </View>
      ))}
      {session.substitution ? (
        <View style={styles.note}>
          <Icon name="refresh-cw" size={16} color={colors.warning} />
          <Text variant="small" style={styles.flex}>
            Remplace « {session.substitution.replacedTitle} » : {session.substitution.reason}
          </Text>
        </View>
      ) : null}
      {session.plan.notes.map((n, i) => (
        <Text key={i} variant="small" color={colors.muted}>
          {n}
        </Text>
      ))}
      <Button kind="secondary" label="Déplacer, alléger ou supprimer" onPress={() => setActions(true)} />
    </View>
  );

  return (
    <>
      <Screen maxWidth={wide ? 1120 : 640}>
        <View style={styles.top}>
          <BackButton onPress={back} />
        </View>

        <View style={styles.head}>
          <Text variant="display" accessibilityRole="header">
            {session.plan.title}
          </Text>
          <View style={styles.meta}>
            <View style={[styles.dot, { backgroundColor: familyColor(d.id) }]} />
            <Text variant="bodyStrong">{d.name}</Text>
            <Tag label={COVERAGE[d.coverage].label} color={COVERAGE[d.coverage].color} />
          </View>
          <Text variant="mono" color={colors.fg}>
            {DAY_LABEL[session.day].long} {date.getDate()} · {formatMinutes(session.plan.estimatedMinutes)} · {INTENSITY_LABEL[session.plan.intensity]}
          </Text>
          {showFocus ? (
            <Text variant="body" color={colors.muted}>
              {focus}
            </Text>
          ) : null}
          {d.coverage === "beta" ? (
            <Text variant="small" color={colors.warning}>
              {COVERAGE.beta.explain}
            </Text>
          ) : null}
        </View>

        {done ? (
          <View style={styles.doneRow}>
            <Icon name="check-circle" size={18} color={colors.accent} />
            <Text variant="bodyStrong">Séance réalisée cette semaine</Text>
          </View>
        ) : (
          <Button
            label={resuming ? "Reprendre la séance" : "Commencer la séance"}
            arrow
            onPress={() => router.push({ pathname: "/live/[id]", params: { id: session.id } })}
          />
        )}

        <View style={[styles.layout, wide && styles.layoutWide]}>
          <View style={[styles.blocks, wide && styles.flex2]}>
            {views.map((v, i) => (
              <BlockCard key={i} v={v} index={i} onExercise={setExerciseId} />
            ))}
          </View>
          <View style={wide ? styles.side : undefined}>{summary}</View>
        </View>
      </Screen>

      <ExerciseSheet exerciseId={exerciseId} onClose={() => setExerciseId(null)} onOpen={setExerciseId} />
      <SessionSheet
        session={actions ? session : null}
        schedule={week.schedule}
        profile={profile}
        onClose={() => setActions(false)}
        onMove={week.move}
        onDowngrade={week.downgrade}
        onRemove={(sid) => {
          week.remove(sid);
          router.replace("/");
        }}
      />
    </>
  );
}

function BackButton({ onPress }: { onPress: () => void }) {
  return (
    <PressScale accessibilityRole="button" accessibilityLabel="Retour à la semaine" onPress={onPress} style={styles.back}>
      <Icon name="arrow-left" size={18} color={colors.muted} />
      <Text variant="bodyStrong" color={colors.muted}>
        Semaine
      </Text>
    </PressScale>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  flex2: { flex: 2, minWidth: 0 },
  shrink: { flexShrink: 1 },
  top: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  back: { flexDirection: "row", alignItems: "center", gap: space.xs, alignSelf: "flex-start" },
  head: { gap: space.sm },
  doneRow: { flexDirection: "row", alignItems: "center", gap: space.sm },
  meta: { flexDirection: "row", alignItems: "center", gap: space.sm, flexWrap: "wrap" },
  dot: { width: 10, height: 10, borderRadius: 5 },
  layout: { gap: space.xl },
  layoutWide: { flexDirection: "row", alignItems: "flex-start", gap: space.xxl },
  blocks: { gap: space.lg },
  side: { flex: 1, minWidth: 0, maxWidth: 380 },
  summary: { gap: space.md },
  load: { gap: space.sm, backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line, padding: space.lg },
  axis: { flexDirection: "row", alignItems: "center", gap: space.md },
  axisLabel: { width: 112 },
  segs: { flex: 1, flexDirection: "row", gap: 4 },
  seg: { flex: 1, height: 6, borderRadius: 3, backgroundColor: colors.line },
  segOn: { backgroundColor: colors.accent },
  note: { flexDirection: "row", gap: space.sm, alignItems: "flex-start", backgroundColor: colors.warningBg, borderRadius: radius.md, padding: space.md },
  noteError: { backgroundColor: colors.dangerBg },
  block: { gap: space.md, paddingBottom: space.lg, borderBottomWidth: 1, borderBottomColor: colors.line },
  blockHead: { flexDirection: "row", gap: space.md, alignItems: "flex-start" },
  blockNum: { width: 24, paddingTop: 2 },
  titleRow: { flexDirection: "row", alignItems: "center", gap: space.sm, flexWrap: "wrap" },
  exList: { gap: space.xs, paddingLeft: 24 + space.md },
  exRow: { flexDirection: "row", alignItems: "center", gap: space.md, paddingVertical: space.xs },
  thumb: { width: 48, height: 48, borderRadius: radius.sm, backgroundColor: colors.surfaceHigh, overflow: "hidden", alignItems: "center", justifyContent: "center" },
});
