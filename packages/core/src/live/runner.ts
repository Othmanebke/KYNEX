import type { SessionPlan } from "../blocks/schema.js";
import { getDiscipline } from "../domain/disciplines.js";
import { findExercise } from "../exercises/library.js";
import type { GpsSummary } from "../tracking/gps.js";
import { SessionResultSchema, type BodyZone, type SessionMetrics, type SessionResult } from "../tracking/metrics.js";
import { expandSteps, type Step } from "./steps.js";

/** Ce que l'utilisateur a réellement fait sur une étape. Tout est optionnel : rien n'est supposé. */
export interface StepActual {
  reps?: number;
  loadKg?: number;
  rpe?: number;
  distanceM?: number;
  /** L'utilisateur confirme explicitement avoir réalisé la cible prescrite (bouton « fait comme prévu »). */
  asPrescribed?: boolean;
  /** Score AMRAP. */
  rounds?: number;
  extraReps?: number;
}

export interface StepEntry {
  stepIndex: number;
  status: "done" | "skipped";
  startedAt: number;
  endedAt: number;
  /** Temps effectif (pauses déduites), mesuré par l'horloge de l'app. */
  activeMs: number;
  actual: StepActual;
}

/**
 * État sérialisable (JSON pur) : il est persisté localement après chaque action, si bien
 * qu'une séance survit à une coupure réseau, à la fermeture de l'app ou à un crash.
 */
export interface LiveState {
  version: 1;
  plan: SessionPlan;
  plannedSessionId?: string;
  steps: Step[];
  status: "ready" | "running" | "paused" | "finished" | "abandoned";
  current: number;
  sessionStartedAt?: number;
  stepStartedAt?: number;
  pausedAt?: number;
  pausedMsInStep: number;
  pausedMsTotal: number;
  entries: StepEntry[];
  finishedAt?: number;
}

export function createLiveState(plan: SessionPlan, plannedSessionId?: string): LiveState {
  return { version: 1, plan, ...(plannedSessionId ? { plannedSessionId } : {}), steps: expandSteps(plan), status: "ready", current: 0, pausedMsInStep: 0, pausedMsTotal: 0, entries: [] };
}

export type LiveAction =
  | { type: "start"; at: number }
  | { type: "complete"; at: number; actual?: StepActual }
  | { type: "skip"; at: number }
  | { type: "pause"; at: number }
  | { type: "resume"; at: number }
  | { type: "tick"; at: number }
  | { type: "abandon"; at: number };

const isTimer = (s: Step) => s.target.durationSec !== undefined && s.autoAdvance;

/** Temps restant sur l'étape courante (minuteur), calculé à partir des horodatages. */
export function remainingMs(state: LiveState, at: number): number | undefined {
  const step = state.steps[state.current];
  if (!step?.target.durationSec || state.stepStartedAt === undefined) return undefined;
  const pausedNow = state.pausedAt !== undefined ? at - state.pausedAt : 0;
  const elapsed = at - state.stepStartedAt - state.pausedMsInStep - pausedNow;
  return Math.max(0, step.target.durationSec * 1000 - elapsed);
}

function closeStep(state: LiveState, at: number, status: StepEntry["status"], actual: StepActual = {}): LiveState {
  const startedAt = state.stepStartedAt ?? at;
  const entry: StepEntry = { stepIndex: state.current, status, startedAt, endedAt: at, activeMs: Math.max(0, at - startedAt - state.pausedMsInStep), actual };
  const next = state.current + 1;
  const done = next >= state.steps.length;
  return {
    ...state,
    entries: [...state.entries, entry],
    current: done ? state.current : next,
    stepStartedAt: done ? undefined : at,
    pausedMsInStep: 0,
    status: done ? "finished" : state.status,
    ...(done ? { finishedAt: at } : {}),
  };
}

/** Réducteur pur : (état, action) → nouvel état. Aucune dépendance au réseau ni à un minuteur système. */
export function reduceLive(state: LiveState, action: LiveAction): LiveState {
  switch (action.type) {
    case "start":
      if (state.status !== "ready") return state;
      return { ...state, status: "running", sessionStartedAt: action.at, stepStartedAt: action.at };
    case "pause":
      return state.status === "running" ? { ...state, status: "paused", pausedAt: action.at } : state;
    case "resume": {
      if (state.status !== "paused" || state.pausedAt === undefined) return state;
      const d = action.at - state.pausedAt;
      const { pausedAt: _, ...rest } = state;
      return { ...rest, status: "running", pausedMsInStep: state.pausedMsInStep + d, pausedMsTotal: state.pausedMsTotal + d };
    }
    case "complete":
      return state.status === "running" ? closeStep(state, action.at, "done", action.actual) : state;
    case "skip":
      return state.status === "running" ? closeStep(state, action.at, "skipped") : state;
    case "tick": {
      // Rattrape aussi les minuteurs écoulés pendant que l'app était en arrière-plan.
      let s = state;
      while (s.status === "running") {
        const step = s.steps[s.current]!;
        const left = remainingMs(s, action.at);
        if (!isTimer(step) || left === undefined || left > 0) break;
        const endAt = s.stepStartedAt! + s.pausedMsInStep + step.target.durationSec! * 1000;
        // Minuteur écoulé : le temps est mesuré, mais rien n'est supposé sur les répétitions.
        s = closeStep(s, endAt, "done", {});
      }
      return s;
    }
    case "abandon":
      return state.status === "finished" ? state : { ...state, status: "abandoned", finishedAt: action.at };
  }
}

// ——— Conversion en résultat de séance ———

export interface LiveCompliance {
  workStepsPlanned: number;
  workStepsDone: number;
  /** Étapes réalisées au-dessus de la cible (reps ou RPE) : signalé, jamais récompensé. */
  workStepsAbovePrescription: number;
  /** RPE moyen saisi vs cible, si les deux sont connus. */
  rpeDelta?: number;
}

const isWork = (s: Step) => s.kind !== "rest" && s.kind !== "flow";
const maxReps = (r: Step["target"]["reps"]) => (r === undefined ? undefined : typeof r === "number" ? r : r.max);
const minReps = (r: Step["target"]["reps"]) => (r === undefined ? undefined : typeof r === "number" ? r : r.min);

/** Reps réalisées : saisies, ou cible confirmée explicitement (« fait comme prévu » = borne basse). */
function repsOf(step: Step, e: StepEntry): number | undefined {
  if (e.actual.reps !== undefined) return e.actual.reps;
  return e.actual.asPrescribed ? minReps(step.target.reps) : undefined;
}

function loadOf(step: Step, e: StepEntry): number | undefined {
  if (e.actual.loadKg !== undefined) return e.actual.loadKg;
  return e.actual.asPrescribed && step.target.load?.type === "absolute" ? step.target.load.kg : undefined;
}

export function compliance(state: LiveState): LiveCompliance {
  const work = state.steps.filter(isWork);
  const done = state.entries.filter((e) => e.status === "done" && isWork(state.steps[e.stepIndex]!));
  let above = 0;
  const rpeDeltas: number[] = [];
  for (const e of done) {
    const step = state.steps[e.stepIndex]!;
    const max = maxReps(step.target.reps);
    if (max !== undefined && e.actual.reps !== undefined && e.actual.reps > max) above++;
    if (step.target.rpe !== undefined && e.actual.rpe !== undefined) {
      rpeDeltas.push(e.actual.rpe - step.target.rpe);
      if (e.actual.rpe > step.target.rpe + 1) above++;
    }
  }
  return {
    workStepsPlanned: work.length,
    workStepsDone: done.length,
    workStepsAbovePrescription: above,
    ...(rpeDeltas.length ? { rpeDelta: Math.round((rpeDeltas.reduce((a, b) => a + b, 0) / rpeDeltas.length) * 10) / 10 } : {}),
  };
}

const MUSCLE_TO_ZONE: Partial<Record<string, BodyZone>> = {
  shoulders: "shoulders", back: "thoracic_spine", hips: "hips", hamstrings: "hamstrings", quads: "quads",
  calves: "calves", core: "lower_back", glutes: "hips", full_body: "full_body", forearms: "wrists",
};

function buildMetrics(state: LiveState, gps?: GpsSummary): SessionMetrics | undefined {
  const model = getDiscipline(state.plan.disciplineId).metricModel;
  const done = state.entries.filter((e) => e.status === "done").map((e) => ({ e, step: state.steps[e.stepIndex]! }));
  const activeSec = Math.round(state.entries.reduce((s, e) => s + e.activeMs, 0) / 1000);

  switch (model) {
    case "resistance": {
      const byEx = new Map<string, Array<{ reps: number; loadKg?: number; rpe?: number }>>();
      for (const { e, step } of done) {
        if (step.kind !== "work_reps" || !step.exerciseId) continue;
        const reps = repsOf(step, e);
        if (reps === undefined) continue; // série validée sans saisie : non enregistrée plutôt qu'inventée
        const loadKg = loadOf(step, e);
        byEx.set(step.exerciseId, [...(byEx.get(step.exerciseId) ?? []), { reps, ...(loadKg !== undefined ? { loadKg } : {}), ...(e.actual.rpe ? { rpe: e.actual.rpe } : {}) }]);
      }
      return byEx.size ? { model, exercises: [...byEx].map(([exerciseId, sets]) => ({ exerciseId, sets })) } : undefined;
    }
    case "skill": {
      const byEx = new Map<string, Array<{ reps?: number; holdSec?: number; timeUnderTensionSec?: number }>>();
      for (const { e, step } of done) {
        if (!step.exerciseId || (step.kind !== "work_reps" && step.kind !== "work_timer")) continue;
        const ex = findExercise(step.exerciseId);
        const measuredSec = Math.round(e.activeMs / 1000);
        let set: { reps?: number; holdSec?: number; timeUnderTensionSec?: number } | undefined;
        if (step.kind === "work_timer" && ex?.progressionMeasures.includes("hold_sec")) set = measuredSec > 0 ? { holdSec: measuredSec } : undefined;
        else {
          const reps = repsOf(step, e);
          if (reps !== undefined) set = { reps, ...(measuredSec > 0 ? { timeUnderTensionSec: measuredSec } : {}) };
        }
        if (set) byEx.set(step.exerciseId, [...(byEx.get(step.exerciseId) ?? []), set]);
      }
      return byEx.size ? { model, exercises: [...byEx].map(([exerciseId, sets]) => ({ exerciseId, sets })), skillsAchieved: [] } : undefined;
    }
    case "endurance": {
      if (gps) return gps.metrics;
      const distance = done.reduce((s, { e }) => s + (e.actual.distanceM ?? 0), 0);
      return activeSec > 0 ? { model, durationSec: activeSec, ...(distance > 0 ? { distanceM: Math.round(distance) } : {}), source: "live" } : undefined;
    }
    case "practice": {
      const ids = [...new Set(done.map(({ step }) => step.exerciseId).filter((x): x is string => !!x))];
      const zones = [...new Set(ids.flatMap((id) => findExercise(id)?.muscles ?? []).map((m) => MUSCLE_TO_ZONE[m]).filter((z): z is BodyZone => !!z))];
      return activeSec > 0 && ids.length ? { model, durationSec: activeSec, practices: ids, zones } : undefined;
    }
    case "wod": {
      const main = state.plan.blocks.find((b) => b.kind === "amrap" || b.kind === "emom" || b.kind === "circuit");
      if (!main) return undefined;
      const movements = main.kind === "amrap" || main.kind === "emom" || main.kind === "circuit" ? main.movements : [];
      const loads = new Map<string, number>();
      for (const { e, step } of done) if (step.exerciseId && e.actual.loadKg !== undefined) loads.set(step.exerciseId, e.actual.loadKg);
      const mv = movements.map((m) => ({ exerciseId: m.exerciseId, ...(m.reps ? { reps: m.reps } : {}), ...(m.distanceM ? { distanceM: m.distanceM } : {}), ...(loads.has(m.exerciseId) ? { loadKg: loads.get(m.exerciseId)! } : {}) }));
      const mainSteps = done.filter(({ step }) => state.plan.blocks[step.blockIndex] === main);
      if (main.kind === "amrap") {
        const score = mainSteps.find(({ step }) => step.kind === "amrap")?.e.actual;
        if (score?.rounds === undefined) return undefined; // pas de score saisi : pas de résultat inventé
        return { model, format: "amrap", scaled: false, movements: mv, durationSec: main.durationMin * 60, result: { type: "rounds_reps", rounds: score.rounds, reps: score.extraReps ?? 0 } };
      }
      if (main.kind === "emom") {
        // Seules les minutes confirmées par l'utilisateur comptent comme réussies.
        const confirmed = mainSteps.filter(({ e }) => e.actual.asPrescribed || e.actual.reps !== undefined);
        return { model, format: "emom", scaled: false, movements: mv, durationSec: main.minutes * 60, result: confirmed.length ? { type: "intervals_completed", completed: confirmed.length, total: main.minutes } : { type: "completed" } };
      }
      const sec = Math.round(mainSteps.reduce((s, { e }) => s + e.activeMs, 0) / 1000);
      return sec > 0 ? { model, format: "circuit", scaled: false, movements: mv, durationSec: sec, result: { type: "completed" } } : undefined;
    }
  }
}

export interface FinishInput {
  resultId: string;
  userId: string;
  /** Date locale de la séance (AAAA-MM-JJ). */
  date: string;
  perceivedEffort?: number;
  painReported?: boolean;
  gps?: GpsSummary;
}

/** Résultat de séance construit uniquement à partir de ce qui a été mesuré ou saisi. */
export function liveToSessionResult(state: LiveState, input: FinishInput): SessionResult {
  const c = compliance(state);
  const status: SessionResult["status"] = c.workStepsDone === 0 ? "skipped" : c.workStepsDone >= c.workStepsPlanned ? "completed" : "partial";
  const metrics = status === "skipped" ? undefined : buildMetrics(state, input.gps);
  const durationSec = state.sessionStartedAt !== undefined && state.finishedAt !== undefined ? Math.round((state.finishedAt - state.sessionStartedAt - state.pausedMsTotal) / 1000) : undefined;
  return SessionResultSchema.parse({
    id: input.resultId,
    userId: input.userId,
    disciplineId: state.plan.disciplineId,
    ...(state.plannedSessionId ? { plannedSessionId: state.plannedSessionId } : {}),
    date: input.date,
    ...(state.sessionStartedAt !== undefined ? { startedAt: new Date(state.sessionStartedAt).toISOString() } : {}),
    status,
    ...(durationSec && durationSec > 0 && status !== "skipped" ? { durationSec } : {}),
    ...(input.perceivedEffort ? { perceivedEffort: input.perceivedEffort } : {}),
    painReported: input.painReported ?? false,
    ...(metrics ? { metrics } : {}),
  });
}
