import { useEffect, useMemo, useState } from "react";
import { ScrollView, StyleSheet, useWindowDimensions, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useKeepAwake } from "expo-keep-awake";
import * as Haptics from "expo-haptics";
import Animated, { cubicBezier, FadeIn } from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";
import { remainingMs, type LiveState, type Step, type StepActual } from "@kynex/core";
import { useJournal } from "@/data/journal";
import type { SaveOutcome } from "@/data/journal-core";
import { useWeek } from "@/data/week";
import { autoTimer, clock, elapsedMs, nextPreview, progress, roundText, stepTitle, targetText, XP_REASON_LABEL } from "@/features/live/live-view";
import { ExerciseSheet } from "@/features/session/ExerciseSheet";
import { findSession, todayWeekday } from "@/features/week/week";
import { WellnessSheet } from "@/features/wellness/WellnessSheet";
import { Button } from "@/ui/Button";
import { Icon } from "@/ui/Icon";
import { formatMinutes } from "@/ui/labels";
import { PressScale } from "@/ui/Pressable";
import { Sheet } from "@/ui/Sheet";
import { NumberField } from "@/ui/NumberField";
import { RpePicker } from "@/ui/RpePicker";
import { Text } from "@/ui/Text";
import { colors, fonts, HIT, radius, space } from "@/ui/tokens";

const EASE_OUT = cubicBezier(0.23, 1, 0.32, 1);

function RunningStep({ state, now, onComplete, onSkip, onExercise }: { state: LiveState; now: number; onComplete: (a: StepActual) => void; onSkip: () => void; onExercise: (id: string) => void }) {
  const step = state.steps[state.current]!;
  const [actual, setActual] = useState<StepActual>({});
  useEffect(() => setActual({}), [state.current]);
  const left = remainingMs(state, now);
  const elapsed = elapsedMs(state, now);
  const target = targetText(step);
  const round = roundText(step);
  const isRest = step.kind === "rest";
  const entered = actual.reps !== undefined || actual.loadKg !== undefined || actual.rpe !== undefined || actual.distanceM !== undefined || actual.rounds !== undefined;
  const timeUp = left !== undefined && left <= 0;

  return (
    <Animated.View key={state.current} entering={FadeIn.duration(180)} style={styles.step}>
      {round ? (
        <Text variant="mono" color={colors.muted}>
          {round}
        </Text>
      ) : null}
      <Text variant="hero" style={styles.stepTitle} accessibilityRole="header" maxFontSizeMultiplier={1.2}>
        {stepTitle(step)}
      </Text>
      {target ? (
        <Text variant="mono" color={colors.accent} style={styles.target}>
          {target}
        </Text>
      ) : null}
      {step.exerciseId ? <Button kind="link" label="Voir la fiche" onPress={() => onExercise(step.exerciseId!)} /> : null}

      {left !== undefined ? (
        <View style={styles.timerWrap} accessible accessibilityRole="timer" accessibilityLabel={`${isRest ? "Repos" : "Temps"} restant : ${clock(left)}`}>
          <Text style={[styles.timer, isRest && styles.timerRest, timeUp && styles.timerDone]} maxFontSizeMultiplier={1}>
            {clock(left)}
          </Text>
          <View style={styles.timerBar}>
            <View style={[styles.timerFill, { width: `${Math.min(100, (1 - left / ((step.target.durationSec ?? 1) * 1000)) * 100)}%` }]} />
          </View>
        </View>
      ) : step.kind === "work_open" || step.kind === "work_distance" ? (
        <Text style={styles.timerSmall} maxFontSizeMultiplier={1}>
          {clock(elapsed)}
        </Text>
      ) : null}

      {step.kind === "work_reps" ? (
        <View style={styles.inputs}>
          <View style={styles.row}>
            <NumberField label="Répétitions" unit="reps" value={actual.reps} onChange={(reps) => setActual((a) => ({ ...a, reps }))} />
            <NumberField label="Charge" unit="kg" decimal value={actual.loadKg} onChange={(loadKg) => setActual((a) => ({ ...a, loadKg }))} />
          </View>
          <Text variant="label" color={colors.muted}>
            Effort perçu (RPE){step.target.rpe ?? (step.target.load?.type === "rpe" ? step.target.load.rpe : undefined) ? " · cible encadrée" : ""}
          </Text>
          <RpePicker value={actual.rpe} onChange={(rpe) => setActual((a) => ({ ...a, rpe }))} target={step.target.rpe ?? (step.target.load?.type === "rpe" ? step.target.load.rpe : undefined)} />
        </View>
      ) : null}

      {step.kind === "work_distance" || step.kind === "work_open" ? (
        <View style={styles.inputs}>
          <NumberField label="Distance parcourue" unit="km" decimal value={actual.distanceM === undefined ? undefined : actual.distanceM / 1000} onChange={(km) => setActual((a) => ({ ...a, distanceM: km === undefined ? undefined : Math.round(km * 1000) }))} />
        </View>
      ) : null}

      {step.kind === "amrap" ? (
        <View style={styles.inputs}>
          <Text variant="small" color={colors.muted}>
            {timeUp ? "Temps écoulé : note ton score." : "Note ton score à la fin."}
          </Text>
          <View style={styles.row}>
            <NumberField label="Tours complets" unit="tours" value={actual.rounds} onChange={(rounds) => setActual((a) => ({ ...a, rounds }))} />
            <NumberField label="Reps en plus" unit="reps" value={actual.extraReps} onChange={(extraReps) => setActual((a) => ({ ...a, extraReps }))} />
          </View>
        </View>
      ) : null}

      <View style={styles.actions}>
        {isRest ? (
          <Button kind="secondary" label="Passer le repos" onPress={onSkip} />
        ) : step.kind === "work_reps" ? (
          <>
            <Button label={entered ? "Valider la série" : "Fait comme prévu"} hint={entered ? undefined : "Enregistre la cible prescrite comme réalisée"} onPress={() => onComplete(entered ? actual : { asPrescribed: true })} />
            <Button kind="link" label="Passer cette série" onPress={onSkip} />
          </>
        ) : step.kind === "amrap" ? (
          <Button label="Enregistrer le score" disabled={actual.rounds === undefined} hint="Indique au moins le nombre de tours" onPress={() => onComplete(actual)} />
        ) : autoTimer(step) ? (
          <Button kind="secondary" label="Passer" onPress={onSkip} />
        ) : (
          <>
            <Button label="Terminé" onPress={() => onComplete(actual)} />
            <Button kind="link" label="Passer" onPress={onSkip} />
          </>
        )}
      </View>
    </Animated.View>
  );
}

function Summary({ state, onSave, onDiscard, outcome }: { state: LiveState | null; onSave: (effort?: number) => void; onDiscard: () => void; outcome: SaveOutcome | null }) {
  const [effort, setEffort] = useState<number | undefined>(undefined);

  if (outcome || !state) {
    if (!outcome) return null;
    const xp = outcome.xp.reduce((n, e) => n + e.amount, 0);
    return (
      <Animated.View entering={FadeIn.duration(240)} style={styles.step}>
        <Text variant="hero" style={styles.stepTitle} accessibilityRole="header">
          {outcome.result.status === "completed" ? "Bien joué." : "C'est noté."}
        </Text>
        <Text variant="body" color={colors.muted}>
          {outcome.result.status === "completed" ? "Séance complète enregistrée." : outcome.result.status === "partial" ? "Séance partielle enregistrée." : "Aucune étape de travail réalisée : rien n'est compté."}
        </Text>
        {xp > 0 ? (
          <View style={styles.card}>
            <Text variant="display" color={colors.accent}>
              +{xp} XP
            </Text>
            {outcome.xp.map((e) => (
              <View key={e.id} style={styles.xpRow}>
                <Text variant="small" style={styles.flex}>
                  {XP_REASON_LABEL[e.reason]}
                </Text>
                <Text variant="mono">+{e.amount}</Text>
              </View>
            ))}
          </View>
        ) : null}
        {outcome.improvedRecords.length ? (
          <View style={styles.card}>
            <Text variant="label" color={colors.muted}>
              Records personnels
            </Text>
            <Text variant="body">{outcome.improvedRecords.length} record{outcome.improvedRecords.length > 1 ? "s" : ""} battu{outcome.improvedRecords.length > 1 ? "s" : ""}.</Text>
          </View>
        ) : null}
        {outcome.unlocked.map((a) => (
          <View key={a.id} style={styles.card}>
            <Icon name="award" size={22} color={colors.accent} />
            <Text variant="headline">{a.title}</Text>
            <Text variant="small" color={colors.muted}>
              {a.description}
            </Text>
          </View>
        ))}
        {outcome.result.metrics === undefined && outcome.result.status !== "skipped" ? (
          <Text variant="small" color={colors.muted}>
            Aucune mesure saisie : la séance compte, mais aucun chiffre n'est inventé pour tes statistiques.
          </Text>
        ) : null}
        <Button label="Retour à la semaine" onPress={() => router.replace("/")} />
      </Animated.View>
    );
  }

  const done = state.entries.filter((e) => e.status === "done").length;
  const minutes = state.sessionStartedAt !== undefined && state.finishedAt !== undefined ? Math.round((state.finishedAt - state.sessionStartedAt - state.pausedMsTotal) / 60000) : undefined;
  return (
    <Animated.View entering={FadeIn.duration(240)} style={styles.step}>
      <Text variant="hero" style={styles.stepTitle} accessibilityRole="header">
        {state.status === "finished" ? "Séance terminée" : "Séance arrêtée"}
      </Text>
      <Text variant="mono" color={colors.muted}>
        {done} / {state.steps.length} étapes{minutes !== undefined ? ` · ${formatMinutes(Math.max(1, minutes))}` : ""}
      </Text>
      <Text variant="label" color={colors.muted}>
        Effort global ressenti (facultatif)
      </Text>
      <RpePicker value={effort} onChange={setEffort} />
      <Button label="Enregistrer la séance" onPress={() => onSave(effort)} />
      <Button kind="link" label="Ne pas enregistrer" onPress={onDiscard} />
    </Animated.View>
  );
}

export default function LiveScreen() {
  useKeepAwake();
  const { id } = useLocalSearchParams<{ id: string }>();
  const week = useWeek();
  const j = useJournal();
  const { width } = useWindowDimensions();
  const session = id ? findSession(week.schedule, id) : undefined;
  const [now, setNow] = useState(Date.now());
  const [exerciseId, setExerciseId] = useState<string | null>(null);
  const [menu, setMenu] = useState(false);
  const [wellness, setWellness] = useState(false);
  const [outcome, setOutcome] = useState<SaveOutcome | null>(null);
  const live = j.live;
  const other = live && live.plannedSessionId !== id && live.status !== "finished" && live.status !== "abandoned";

  // Prépare la séance (ou reprend celle déjà en cours pour ce créneau).
  useEffect(() => {
    if (session && !other && !outcome) j.startLive(session);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.id, other]);

  const step: Step | undefined = live?.steps[live.current];
  const running = live?.status === "running";

  // Horloge d'affichage + rattrapage des minuteurs (le réducteur fait foi, pas l'intervalle).
  useEffect(() => {
    if (!live || (live.status !== "running" && live.status !== "paused")) return;
    const t = setInterval(() => {
      const at = Date.now();
      setNow(at);
      if (live.status === "running" && step && autoTimer(step)) j.dispatch({ type: "tick", at });
    }, 250);
    return () => clearInterval(t);
  }, [live, step, j]);

  // Retour haptique quand un minuteur se termine seul (changement d'étape sans geste).
  const [lastIndex, setLastIndex] = useState(live?.current ?? 0);
  useEffect(() => {
    if (!live) return;
    if (live.current !== lastIndex) {
      const prev = live.steps[lastIndex];
      if (prev && autoTimer(prev)) void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setLastIndex(live.current);
    }
  }, [live, lastIndex]);

  const p = useMemo(() => (live ? progress(live) : { done: 0, total: 1 }), [live]);
  const close = () => (router.canGoBack() ? router.back() : router.replace("/"));

  if (!session && !live) {
    return (
      <SafeAreaView style={styles.root}>
        <View style={styles.center}>
          <Text variant="display">Séance introuvable</Text>
          <Button kind="secondary" label="Retour à la semaine" onPress={() => router.replace("/")} />
        </View>
      </SafeAreaView>
    );
  }

  if (other && live) {
    return (
      <SafeAreaView style={styles.root}>
        <View style={styles.center}>
          <Text variant="display">Une séance est déjà en cours</Text>
          <Text variant="body" color={colors.muted}>
            « {live.plan.title} » n'est pas terminée. Reprends-la ou arrête-la avant d'en commencer une autre.
          </Text>
          <Button label="Reprendre cette séance" onPress={() => router.replace({ pathname: "/live/[id]", params: { id: live.plannedSessionId ?? "" } })} />
          <Button kind="danger" label="L'arrêter sans enregistrer" onPress={j.discardLive} />
        </View>
      </SafeAreaView>
    );
  }

  const wide = width >= 900;
  const finished = live && (live.status === "finished" || live.status === "abandoned");

  return (
    <SafeAreaView style={styles.root} edges={["top", "bottom", "left", "right"]}>
      {/* En-tête : sortir (la séance est gardée), avancement, pause. */}
      <View style={styles.top}>
        <PressScale accessibilityRole="button" accessibilityLabel="Quitter l'écran, la séance est conservée" onPress={close} style={styles.iconBtn}>
          <Icon name="x" size={24} />
        </PressScale>
        <View style={styles.flex}>
          <Text variant="small" color={colors.muted} numberOfLines={1} style={styles.centerText}>
            {live?.plan.title}
          </Text>
          <View style={styles.progress} accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: p.total, now: p.done }}>
            <Animated.View style={[styles.progressFill, { width: `${(p.done / p.total) * 100}%`, transitionProperty: "width", transitionDuration: 250, transitionTimingFunction: EASE_OUT }]} />
          </View>
        </View>
        {live && (live.status === "running" || live.status === "paused") ? (
          <PressScale
            accessibilityRole="button"
            accessibilityLabel={live.status === "paused" ? "Reprendre" : "Pause"}
            onPress={() => j.dispatch({ type: live.status === "paused" ? "resume" : "pause", at: Date.now() })}
            style={styles.iconBtn}
          >
            <Icon name={live.status === "paused" ? "play" : "pause"} size={22} />
          </PressScale>
        ) : (
          <View style={styles.iconBtn} />
        )}
      </View>

      {!j.online ? (
        <View style={styles.offline}>
          <Icon name="wifi-off" size={14} color={colors.muted} />
          <Text variant="small" color={colors.muted}>
            Hors connexion : tout est enregistré sur l'appareil.
          </Text>
        </View>
      ) : null}

      <ScrollView contentContainerStyle={[styles.body, wide && styles.bodyWide]} keyboardShouldPersistTaps="handled">
        <View style={[styles.column, wide && { maxWidth: 640 }]}>
          {outcome ? (
            <Summary state={null} outcome={outcome} onSave={() => undefined} onDiscard={() => undefined} />
          ) : !live ? null : live.status === "ready" ? (
            <Animated.View entering={FadeIn.duration(200)} style={styles.step}>
              <Text variant="hero" style={styles.stepTitle} accessibilityRole="header">
                {live.plan.title}
              </Text>
              <Text variant="mono" color={colors.muted}>
                {live.steps.length} étapes · environ {formatMinutes(live.plan.estimatedMinutes)}
              </Text>
              <Text variant="body" color={colors.muted}>
                L'écran reste allumé. Tu peux quitter et revenir : la séance reprend exactement où tu l'as laissée, même sans connexion.
              </Text>
              <Button label="Démarrer" onPress={() => j.dispatch({ type: "start", at: Date.now() })} />
            </Animated.View>
          ) : finished ? (
            <Summary
              state={live}
              outcome={outcome}
              onSave={(effort) => setOutcome(j.finishLive({ ...(effort ? { perceivedEffort: effort } : {}) }))}
              onDiscard={() => {
                j.discardLive();
                router.replace("/");
              }}
            />
          ) : (
            <>
              {live.status === "paused" ? (
                <View style={styles.paused} accessibilityLiveRegion="polite">
                  <Text variant="title">En pause</Text>
                  <Button label="Reprendre" onPress={() => j.dispatch({ type: "resume", at: Date.now() })} />
                </View>
              ) : null}
              <RunningStep
                state={live}
                now={now}
                onExercise={setExerciseId}
                onComplete={(actual) => {
                  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  j.dispatch({ type: "complete", at: Date.now(), actual });
                }}
                onSkip={() => j.dispatch({ type: "skip", at: Date.now() })}
              />
              {nextPreview(live) ? (
                <View style={styles.next}>
                  <Text variant="label" color={colors.muted}>
                    Ensuite
                  </Text>
                  <Text variant="body" color={colors.muted}>
                    {nextPreview(live)}
                  </Text>
                </View>
              ) : null}
            </>
          )}
        </View>
      </ScrollView>

      {live && running ? (
        <View style={styles.bottom}>
          <View style={styles.flex}>
            <Button kind="secondary" label="Fatigue ou douleur" onPress={() => setWellness(true)} />
          </View>
          <PressScale accessibilityRole="button" accessibilityLabel="Plus d'options" onPress={() => setMenu(true)} style={styles.iconBtnBox}>
            <Icon name="more-horizontal" size={22} />
          </PressScale>
        </View>
      ) : null}

      <ExerciseSheet exerciseId={exerciseId} onClose={() => setExerciseId(null)} onOpen={setExerciseId} />
      <Sheet visible={menu} onClose={() => setMenu(false)} title="Séance">
        <Button
          kind="danger"
          label="Arrêter la séance"
          hint="Ce qui est fait reste enregistrable"
          onPress={() => {
            setMenu(false);
            j.dispatch({ type: "abandon", at: Date.now() });
          }}
        />
      </Sheet>
      <WellnessSheet
        visible={wellness}
        onClose={() => setWellness(false)}
        defaultDay={todayWeekday(new Date())}
        chooseDay={false}
        onApply={(signal) => {
          week.applyWellness(signal);
          // Douleur : on arrête proprement ; ce qui est fait est enregistré, sans pénalité.
          if (signal.kind === "pain") setOutcome(j.finishLive({ painReported: true }));
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1, minWidth: 0 },
  center: { flex: 1, padding: space.xl, gap: space.lg, justifyContent: "center", maxWidth: 560, width: "100%", alignSelf: "center" },
  centerText: { textAlign: "center" },
  top: { flexDirection: "row", alignItems: "center", gap: space.sm, paddingHorizontal: space.sm, paddingTop: space.xs },
  iconBtn: { width: HIT, height: HIT, alignItems: "center", justifyContent: "center" },
  iconBtnBox: { width: HIT + 4, height: HIT + 4, alignItems: "center", justifyContent: "center", borderRadius: radius.md, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface },
  progress: { height: 4, borderRadius: 2, backgroundColor: colors.line, overflow: "hidden", marginTop: 6 },
  progressFill: { position: "absolute", left: 0, top: 0, bottom: 0, backgroundColor: colors.accent },
  offline: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: space.xs, paddingVertical: space.xs },
  body: { flexGrow: 1, paddingHorizontal: space.xl - 4, paddingVertical: space.xl },
  bodyWide: { alignItems: "center" },
  column: { width: "100%", gap: space.xl },
  step: { gap: space.md },
  stepTitle: { fontSize: 48, lineHeight: 46 },
  target: { fontSize: 18, lineHeight: 24 },
  timerWrap: { gap: space.sm, paddingVertical: space.md },
  timer: { fontFamily: fonts.display, fontSize: 112, lineHeight: 112, color: colors.fg, fontVariant: ["tabular-nums"], letterSpacing: -2 },
  timerRest: { color: colors.accent },
  timerDone: { color: colors.muted },
  timerSmall: { fontFamily: fonts.display, fontSize: 64, lineHeight: 64, color: colors.fg, fontVariant: ["tabular-nums"] },
  timerBar: { height: 6, borderRadius: 3, backgroundColor: colors.line, overflow: "hidden" },
  timerFill: { position: "absolute", left: 0, top: 0, bottom: 0, backgroundColor: colors.accent },
  inputs: { gap: space.md },
  row: { flexDirection: "row", gap: space.md, flexWrap: "wrap" },
  actions: { gap: space.sm, marginTop: space.sm },
  next: { gap: 2, paddingTop: space.md, borderTopWidth: 1, borderTopColor: colors.line },
  paused: { gap: space.md, backgroundColor: colors.surface, borderRadius: radius.md, padding: space.lg, borderWidth: 1, borderColor: colors.line },
  bottom: { flexDirection: "row", gap: space.sm, paddingHorizontal: space.xl - 4, paddingVertical: space.md, borderTopWidth: 1, borderTopColor: colors.line, alignItems: "center" },
  card: { gap: space.xs, backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line, padding: space.lg },
  xpRow: { flexDirection: "row", alignItems: "center", gap: space.sm },
});
