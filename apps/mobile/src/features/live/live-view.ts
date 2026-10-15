import { findExercise, type LiveState, type Step, type XpReason } from "@kynex/core";
import { formatDistance, formatLoad, formatReps, formatSec } from "@/features/session/blocks";

/** Présentation d'une étape de séance en direct. Logique pure, testée. */

export const exerciseName = (id?: string): string | null => (id ? (findExercise(id)?.name ?? null) : null);

/** Titre lisible : nom de l'exercice (jamais un identifiant brut), ou nature de l'étape. */
export function stepTitle(s: Step): string {
  if (s.kind === "rest") return s.label;
  if (s.kind === "amrap") return s.label;
  const name = exerciseName(s.exerciseId);
  if (name) return name;
  return /^[a-z0-9_]+$/.test(s.label) ? "Exercice" : s.label;
}

/** Cible prescrite : « 6–10 reps · RPE 8 », « 45 s », « 400 m ». Rien d'autre que ce qui est prescrit. */
export function targetText(s: Step): string | null {
  const t = s.target;
  const parts = [
    t.reps !== undefined ? `${formatReps(t.reps)} reps` : null,
    t.durationSec !== undefined && s.kind !== "rest" && !(t.reps !== undefined && s.kind === "work_timer") ? formatSec(t.durationSec) : null,
    t.distanceM !== undefined ? formatDistance(t.distanceM) : null,
    t.perSide ? "par côté" : null,
    t.load ? formatLoad(t.load) : null,
    t.rpe !== undefined && !(t.load?.type === "rpe") ? `RPE ${t.rpe}` : null,
  ].filter(Boolean);
  return parts.length ? parts.join(" · ") : null;
}

export function roundText(s: Step): string | null {
  if (!s.round) return null;
  const unit = s.kind === "work_timer" && s.label.startsWith("EMOM") ? "Minute" : s.kind === "work_reps" ? "Série" : "Tour";
  return `${unit} ${s.round.current} / ${s.round.total}`;
}

export function nextPreview(state: LiveState): string | null {
  const n = state.steps[state.current + 1];
  if (!n) return null;
  const t = n.kind === "rest" ? formatSec(n.target.durationSec ?? 0) : targetText(n);
  return `${stepTitle(n)}${t ? ` · ${t}` : ""}`;
}

/** Étapes de travail (hors repos / échauffement) pour l'avancement. */
export const isWorkStep = (s: Step): boolean => s.kind !== "rest" && s.kind !== "flow";

export function progress(state: LiveState): { done: number; total: number } {
  return { done: Math.min(state.entries.length, state.steps.length), total: state.steps.length };
}

/** Le minuteur avance-t-il seul ? (les AMRAP attendent la saisie du score, voir live.tsx). */
export const autoTimer = (s: Step): boolean => s.autoAdvance && s.target.durationSec !== undefined && s.kind !== "amrap";

export const XP_REASON_LABEL: Record<XpReason, string> = {
  session: "Séance réalisée",
  planned_bonus: "Séance du plan",
  duration_bonus: "Temps mesuré",
  personal_record: "Record personnel",
  prescription_respected: "Prescription respectée",
  rest_day_check_in: "Bilan de récupération",
  weekly_goal: "Objectif de la semaine",
  quest: "Quête",
  achievement: "Succès",
};

/** mm:ss pour les minuteurs. */
export function clock(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/** Temps écoulé sur l'étape en cours, pauses déduites. */
export function elapsedMs(state: LiveState, at: number): number {
  if (state.stepStartedAt === undefined) return 0;
  const pausedNow = state.pausedAt !== undefined ? at - state.pausedAt : 0;
  return Math.max(0, at - state.stepStartedAt - state.pausedMsInStep - pausedNow);
}
