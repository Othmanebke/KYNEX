import { findExercise, type Block, type Intensity, type Load, type Reps } from "@kynex/core";

/**
 * Mise en forme française d'un bloc de séance : un titre, une prescription
 * (« 4 × 6–10 reps · RPE 8 · repos 2 min ») et la liste des exercices avec leur dose.
 * Logique pure, testée sans React. Rien n'est inventé : seuls les champs présents sont dits.
 */

export const BLOCK_KIND_LABEL: Record<Block["kind"], string> = {
  warmup: "Échauffement",
  mobility: "Mobilité",
  cooldown: "Retour au calme",
  sets_reps: "Séries",
  loaded_sets: "Séries avec charge",
  timed: "Effort chronométré",
  distance: "Distance",
  intervals: "Fractionné",
  circuit: "Circuit",
  emom: "EMOM",
  amrap: "AMRAP",
  technique: "Technique",
  rest: "Repos",
  outdoor: "Sortie",
};

const INTENSITY: Record<Intensity, string> = { recovery: "récupération", low: "facile", moderate: "modérée", high: "intense" };
const TERRAIN = { road: "route", trail: "chemin", track: "piste", mixed: "terrain varié" } as const;
const REST_MODE = { passive: "à l'arrêt", walk: "en marchant", jog: "en trottinant" } as const;

/** 45 → « 45 s », 60 → « 1 min », 90 → « 1 min 30 », 3600 → « 60 min ». */
export function formatSec(sec: number): string {
  if (sec < 60) return `${sec} s`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return s ? `${m} min ${String(s).padStart(2, "0")}` : `${m} min`;
}

export function formatDistance(m: number): string {
  return m >= 1000 ? `${(m / 1000).toLocaleString("fr-FR", { maximumFractionDigits: 2 })} km` : `${m} m`;
}

export const formatReps = (r: Reps): string => (typeof r === "number" ? `${r}` : `${r.min}–${r.max}`);

export function formatLoad(l: Load): string {
  switch (l.type) {
    case "rpe":
      return `RPE ${l.rpe}`;
    case "percent_1rm":
      return `${l.percent} % du max`;
    case "absolute":
      return `${l.kg.toLocaleString("fr-FR")} kg`;
  }
}

/** Allure en secondes par km → « 5:30 /km ». */
export const formatPace = (secPerKm: number): string => `${Math.floor(secPerKm / 60)}:${String(secPerKm % 60).padStart(2, "0")} /km`;

export interface ExerciseLine {
  exerciseId: string;
  name: string;
  /** Dose propre à l'exercice dans ce bloc (« 10 reps par côté »), ou null si le bloc la porte. */
  dose: string | null;
}

export interface BlockView {
  kindLabel: string;
  title: string;
  /** Prescription du bloc ; null si tout est porté par les exercices. */
  prescription: string | null;
  exercises: ExerciseLine[];
  notes: string | null;
}

const exName = (id: string): string => findExercise(id)?.name ?? id;

function dose(m: { reps?: number; durationSec?: number; distanceM?: number; perSide?: boolean; load?: Load }): string {
  const parts = [
    m.reps !== undefined ? `${m.reps} reps` : m.durationSec !== undefined ? formatSec(m.durationSec) : m.distanceM !== undefined ? formatDistance(m.distanceM) : null,
    m.perSide ? "par côté" : null,
    m.load ? formatLoad(m.load) : null,
  ];
  return parts.filter(Boolean).join(" ");
}

const join = (xs: (string | null | undefined | false)[]): string | null => {
  const s = xs.filter(Boolean).join(" · ");
  return s || null;
};

const rpeHint = (b: Block): string | null => (b.targetRpe !== undefined ? `effort perçu ${b.targetRpe}/10` : null);

export function describeBlock(b: Block): BlockView {
  const kindLabel = BLOCK_KIND_LABEL[b.kind];
  const base = { kindLabel, notes: b.notes ?? null };
  switch (b.kind) {
    case "warmup":
    case "mobility":
    case "cooldown":
      return { ...base, title: b.label ?? kindLabel, prescription: rpeHint(b), exercises: b.items.map((i) => ({ exerciseId: i.exerciseId, name: exName(i.exerciseId), dose: dose(i) })) };
    case "sets_reps":
      return {
        ...base,
        title: b.label ?? exName(b.exerciseId),
        prescription: join([`${b.sets} × ${formatReps(b.reps)} reps${b.perSide ? " par côté" : ""}`, rpeHint(b), b.restSec ? `repos ${formatSec(b.restSec)}` : null]),
        exercises: [{ exerciseId: b.exerciseId, name: exName(b.exerciseId), dose: null }],
      };
    case "loaded_sets":
      return {
        ...base,
        title: b.label ?? exName(b.exerciseId),
        prescription: join([`${b.sets} × ${formatReps(b.reps)} reps`, formatLoad(b.load), b.restSec ? `repos ${formatSec(b.restSec)}` : null]),
        exercises: [{ exerciseId: b.exerciseId, name: exName(b.exerciseId), dose: null }],
      };
    case "timed":
      return {
        ...base,
        title: b.label ?? exName(b.exerciseId),
        prescription: join([`${b.sets > 1 ? `${b.sets} × ` : ""}${formatSec(b.durationSec)}`, rpeHint(b), b.restSec ? `repos ${formatSec(b.restSec)}` : null]),
        exercises: [{ exerciseId: b.exerciseId, name: exName(b.exerciseId), dose: null }],
      };
    case "distance":
      return {
        ...base,
        title: b.label ?? exName(b.exerciseId),
        prescription: join([formatDistance(b.distanceM), INTENSITY[b.intensity], b.targetPaceSecPerKm ? `allure ${formatPace(b.targetPaceSecPerKm)}` : null, rpeHint(b)]),
        exercises: [{ exerciseId: b.exerciseId, name: exName(b.exerciseId), dose: null }],
      };
    case "intervals":
      return {
        ...base,
        title: b.label ?? exName(b.exerciseId),
        prescription: join([
          `${b.repeats} × ${b.workSec !== undefined ? formatSec(b.workSec) : formatDistance(b.workDistanceM!)}`,
          INTENSITY[b.intensity],
          b.restSec ? `récup ${formatSec(b.restSec)} ${REST_MODE[b.restMode]}` : null,
          rpeHint(b),
        ]),
        exercises: [{ exerciseId: b.exerciseId, name: exName(b.exerciseId), dose: null }],
      };
    case "circuit":
      return {
        ...base,
        title: b.label ?? kindLabel,
        prescription: join([
          `${b.rounds} tour${b.rounds > 1 ? "s" : ""}`,
          b.restBetweenMovementsSec ? `${formatSec(b.restBetweenMovementsSec)} entre mouvements` : null,
          b.restBetweenRoundsSec ? `${formatSec(b.restBetweenRoundsSec)} entre tours` : null,
          rpeHint(b),
        ]),
        exercises: b.movements.map((m) => ({ exerciseId: m.exerciseId, name: exName(m.exerciseId), dose: dose(m) })),
      };
    case "emom":
      return {
        ...base,
        title: b.label ?? kindLabel,
        prescription: join([`${b.minutes} min`, "un mouvement au début de chaque minute", rpeHint(b)]),
        exercises: b.movements.map((m) => ({ exerciseId: m.exerciseId, name: exName(m.exerciseId), dose: dose(m) })),
      };
    case "amrap":
      return {
        ...base,
        title: b.label ?? kindLabel,
        prescription: join([`${b.durationMin} min`, "un maximum de tours", rpeHint(b)]),
        exercises: b.movements.map((m) => ({ exerciseId: m.exerciseId, name: exName(m.exerciseId), dose: dose(m) })),
      };
    case "technique":
      return {
        ...base,
        title: b.label ?? kindLabel,
        prescription: join([`${b.durationMin} min`, b.focus]),
        exercises: b.exerciseId ? [{ exerciseId: b.exerciseId, name: exName(b.exerciseId), dose: null }] : [],
      };
    case "rest":
      return { ...base, title: b.label ?? kindLabel, prescription: formatSec(b.durationSec), exercises: [] };
    case "outdoor":
      return {
        ...base,
        title: b.label ?? exName(b.exerciseId),
        prescription: join([
          b.targetDurationMin ? `${b.targetDurationMin} min` : null,
          b.targetDistanceM ? formatDistance(b.targetDistanceM) : null,
          b.terrain ? TERRAIN[b.terrain] : null,
          INTENSITY[b.intensity],
          rpeHint(b),
        ]),
        exercises: [{ exerciseId: b.exerciseId, name: exName(b.exerciseId), dose: null }],
      };
  }
}

/** Les blocs « structure » (échauffement, retour au calme, repos) encadrent le corps de séance. */
export const isFrameBlock = (b: Block): boolean => b.kind === "warmup" || b.kind === "cooldown" || b.kind === "rest";
