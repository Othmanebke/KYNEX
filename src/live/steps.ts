import type { Block, Load, Reps, SessionPlan } from "../blocks/schema.js";

/**
 * Une séance planifiée est « déroulée » en étapes exécutables une à une à l'écran.
 * Chaque étape porte sa cible (ce qui est prescrit) ; ce qui est réalisé est saisi à part.
 */
export type StepKind = "work_reps" | "work_timer" | "work_distance" | "work_open" | "rest" | "amrap" | "flow";

export interface Step {
  index: number;
  blockIndex: number;
  kind: StepKind;
  label: string;
  exerciseId?: string;
  /** Numéro de série / tour / répétition d'intervalle, pour l'affichage (« série 2/4 »). */
  round?: { current: number; total: number };
  target: {
    reps?: Reps;
    load?: Load;
    durationSec?: number;
    distanceM?: number;
    rpe?: number;
    perSide?: boolean;
  };
  /** Passe automatiquement à l'étape suivante à la fin du minuteur (repos, EMOM, intervalles). */
  autoAdvance: boolean;
}

const rest = (blockIndex: number, sec: number, label = "Repos"): Omit<Step, "index"> | null =>
  sec > 0 ? { blockIndex, kind: "rest", label, target: { durationSec: sec }, autoAdvance: true } : null;

function blockSteps(b: Block, bi: number): Array<Omit<Step, "index">> {
  const out: Array<Omit<Step, "index"> | null> = [];
  switch (b.kind) {
    case "sets_reps":
    case "loaded_sets":
      for (let s = 1; s <= b.sets; s++) {
        out.push({
          blockIndex: bi,
          kind: "work_reps",
          label: b.label ?? b.exerciseId,
          exerciseId: b.exerciseId,
          round: { current: s, total: b.sets },
          target: { reps: b.reps, ...(b.kind === "loaded_sets" ? { load: b.load } : {}), ...(b.targetRpe ? { rpe: b.targetRpe } : {}), ...(b.kind === "sets_reps" && b.perSide ? { perSide: true } : {}) },
          autoAdvance: false,
        });
        if (s < b.sets) out.push(rest(bi, b.restSec));
      }
      break;
    case "timed":
      for (let s = 1; s <= b.sets; s++) {
        out.push({ blockIndex: bi, kind: "work_timer", label: b.label ?? b.exerciseId, exerciseId: b.exerciseId, round: { current: s, total: b.sets }, target: { durationSec: b.durationSec }, autoAdvance: false });
        if (s < b.sets) out.push(rest(bi, b.restSec));
      }
      break;
    case "distance":
      out.push({ blockIndex: bi, kind: "work_distance", label: b.label ?? b.exerciseId, exerciseId: b.exerciseId, target: { distanceM: b.distanceM }, autoAdvance: false });
      break;
    case "outdoor":
      out.push({
        blockIndex: bi,
        kind: b.targetDistanceM ? "work_distance" : "work_open",
        label: b.label ?? b.exerciseId,
        exerciseId: b.exerciseId,
        target: { ...(b.targetDistanceM ? { distanceM: b.targetDistanceM } : {}), ...(b.targetDurationMin ? { durationSec: b.targetDurationMin * 60 } : {}) },
        autoAdvance: false,
      });
      break;
    case "intervals":
      for (let r = 1; r <= b.repeats; r++) {
        out.push({
          blockIndex: bi,
          kind: b.workSec ? "work_timer" : "work_distance",
          label: b.label ?? b.exerciseId,
          exerciseId: b.exerciseId,
          round: { current: r, total: b.repeats },
          target: b.workSec ? { durationSec: b.workSec } : { distanceM: b.workDistanceM! },
          autoAdvance: !!b.workSec,
        });
        if (r < b.repeats) out.push(rest(bi, b.restSec, b.restMode === "passive" ? "Récupération" : b.restMode === "walk" ? "Marche" : "Trot"));
      }
      break;
    case "circuit":
      for (let r = 1; r <= b.rounds; r++) {
        b.movements.forEach((m, mi) => {
          out.push({
            blockIndex: bi,
            kind: m.durationSec ? "work_timer" : m.distanceM ? "work_distance" : "work_reps",
            label: m.exerciseId,
            exerciseId: m.exerciseId,
            round: { current: r, total: b.rounds },
            target: { ...(m.reps ? { reps: m.reps } : {}), ...(m.durationSec ? { durationSec: m.durationSec } : {}), ...(m.distanceM ? { distanceM: m.distanceM } : {}), ...(m.load ? { load: m.load } : {}) },
            autoAdvance: !!m.durationSec,
          });
          if (mi < b.movements.length - 1) out.push(rest(bi, b.restBetweenMovementsSec, "Transition"));
        });
        if (r < b.rounds) out.push(rest(bi, b.restBetweenRoundsSec));
      }
      break;
    case "emom":
      for (let min = 1; min <= b.minutes; min++) {
        const m = b.movements[(min - 1) % b.movements.length]!;
        out.push({
          blockIndex: bi,
          kind: "work_timer",
          label: `EMOM ${min}/${b.minutes} — ${m.exerciseId}`,
          exerciseId: m.exerciseId,
          round: { current: min, total: b.minutes },
          target: { durationSec: 60, ...(m.reps ? { reps: m.reps } : {}) },
          autoAdvance: true,
        });
      }
      break;
    case "amrap":
      out.push({ blockIndex: bi, kind: "amrap", label: `AMRAP ${b.durationMin} min`, target: { durationSec: b.durationMin * 60 }, autoAdvance: true });
      break;
    case "technique":
      out.push({ blockIndex: bi, kind: "work_timer", label: b.focus, ...(b.exerciseId ? { exerciseId: b.exerciseId } : {}), target: { durationSec: b.durationMin * 60 }, autoAdvance: false });
      break;
    case "warmup":
    case "mobility":
    case "cooldown":
      for (const it of b.items) {
        out.push({
          blockIndex: bi,
          kind: "flow",
          label: it.exerciseId,
          exerciseId: it.exerciseId,
          target: { ...(it.durationSec ? { durationSec: it.durationSec * (it.perSide ? 2 : 1) } : { reps: it.reps! }), ...(it.perSide ? { perSide: true } : {}) },
          autoAdvance: !!it.durationSec,
        });
      }
      break;
    case "rest":
      out.push(rest(bi, b.durationSec));
      break;
  }
  return out.filter((s): s is Omit<Step, "index"> => s !== null);
}

export function expandSteps(plan: SessionPlan): Step[] {
  return plan.blocks.flatMap((b, bi) => blockSteps(b, bi)).map((s, index) => ({ ...s, index }));
}
