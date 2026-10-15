import { estimateMinutes, type Block, type Reps, type SessionPlan, type TrainingLoad } from "../blocks/schema.js";
import type { Goal, Level, MovementPattern } from "../domain/enums.js";
import { candidates, type AvailabilityContext } from "../exercises/filter.js";
import type { Exercise } from "../exercises/schema.js";
import { compact, cooldownBlock, warmupBlock } from "./common.js";
import { capIntensity, cnsAfterCap, type GenerateRequest, type SessionGenerator, type SlotSpec, type WeekContext } from "./types.js";

type Split = "full_a" | "full_b" | "full_c" | "upper" | "lower";

const SPLIT_PATTERNS: Record<Split, MovementPattern[]> = {
  full_a: ["squat", "horizontal_push", "horizontal_pull", "hinge", "core"],
  full_b: ["hinge", "vertical_push", "vertical_pull", "lunge", "core"],
  full_c: ["squat", "vertical_push", "horizontal_pull", "lunge", "core"],
  upper: ["horizontal_push", "horizontal_pull", "vertical_push", "vertical_pull", "core"],
  lower: ["squat", "hinge", "lunge", "core"],
};

const SPLIT_LOAD: Record<Split, TrainingLoad> = {
  full_a: { lowerBody: 2, upperBody: 2, cardio: 1, impact: 0, cns: 1 },
  full_b: { lowerBody: 2, upperBody: 2, cardio: 1, impact: 0, cns: 1 },
  full_c: { lowerBody: 2, upperBody: 2, cardio: 1, impact: 0, cns: 1 },
  upper: { lowerBody: 0, upperBody: 3, cardio: 1, impact: 0, cns: 1 },
  lower: { lowerBody: 3, upperBody: 0, cardio: 1, impact: 0, cns: 1 },
};

const SPLIT_TITLE: Record<Split, string> = {
  full_a: "Full body A",
  full_b: "Full body B",
  full_c: "Full body C",
  upper: "Haut du corps",
  lower: "Bas du corps",
};

/** Choix de répartition selon la fréquence et le niveau (règle classique et prudente). */
export function chooseSplit(count: number, level: Level): Split[] {
  if (count <= 1) return ["full_a"];
  if (count === 2) return ["full_a", "full_b"];
  if (count === 3) return level === "beginner" ? ["full_a", "full_b", "full_c"] : ["upper", "lower", "full_a"];
  const ul: Split[] = ["upper", "lower", "upper", "lower"];
  return [...ul, "full_b", "full_c"].slice(0, count) as Split[];
}

/**
 * SNC : la force maximale (séries lourdes de 3–5) sur les gros mouvements du bas du corps
 * est la sollicitation la plus coûteuse ; l'hypertrophie l'est moins, le travail général peu.
 */
export function strengthCns(split: Split, goals: Goal[], level: Level): number {
  if (level === "beginner") return 1;
  const lowerHeavy = split !== "upper";
  if (goals.includes("max_strength")) return lowerHeavy ? 3 : 2;
  if (goals.includes("muscle_gain") || goals.includes("weight_gain")) return lowerHeavy ? 2 : 1;
  return 1;
}

interface Prescription {
  mainSets: number;
  mainReps: Reps;
  mainRest: number;
  accSets: number;
  accReps: Reps;
  accRest: number;
  rpe: number;
}

export function prescriptionFor(goals: Goal[], level: Level): Prescription {
  const beginner = level === "beginner";
  if (goals.includes("max_strength")) {
    return { mainSets: beginner ? 3 : 5, mainReps: { min: 3, max: 5 }, mainRest: 180, accSets: 3, accReps: { min: 6, max: 10 }, accRest: 120, rpe: beginner ? 7 : 8 };
  }
  if (goals.includes("muscle_gain") || goals.includes("weight_gain")) {
    return { mainSets: beginner ? 3 : 4, mainReps: { min: 6, max: 10 }, mainRest: 120, accSets: 3, accReps: { min: 10, max: 15 }, accRest: 75, rpe: 8 };
  }
  return { mainSets: beginner ? 2 : 3, mainReps: { min: 8, max: 12 }, mainRest: 90, accSets: beginner ? 2 : 3, accReps: { min: 12, max: 15 }, accRest: 60, rpe: 7 };
}

const ownsLoadFor = (ex: Exercise, ctx: AvailabilityContext): boolean => {
  const owned = new Set<string>(ctx.equipment);
  return ex.progressionMeasures.includes("load_kg") && ex.equipmentOptions.some((set) => set.length > 0 && set.every((e) => owned.has(e)));
};

function exerciseBlock(ex: Exercise, sets: number, reps: Reps, rest: number, rpe: number, ctx: AvailabilityContext): Block {
  if (ex.progressionMeasures.includes("hold_sec") && !ex.progressionMeasures.includes("reps")) {
    return { kind: "timed", exerciseId: ex.id, sets, durationSec: 30, restSec: 45, targetRpe: rpe };
  }
  if (ownsLoadFor(ex, ctx)) {
    // Charge exprimée en RPE : aucune charge en kg n'est inventée sans historique.
    return { kind: "loaded_sets", exerciseId: ex.id, sets, reps, load: { type: "rpe", rpe }, restSec: rest };
  }
  return { kind: "sets_reps", exerciseId: ex.id, sets, reps, restSec: rest, targetRpe: rpe };
}

export const strengthGenerator: SessionGenerator = {
  disciplineId: "strength_training",
  variants: SPLIT_TITLE,

  planSlots(count: number, ctx: WeekContext): SlotSpec[] {
    const natural = ctx.discipline.level === "beginner" ? "moderate" : "high";
    const intensity = capIntensity(natural, ctx.intensityCap);
    return chooseSplit(count, ctx.discipline.level).map((split, index) => ({
      disciplineId: "strength_training",
      variant: split,
      index,
      intensity,
      load: { ...SPLIT_LOAD[split], cns: cnsAfterCap(strengthCns(split, ctx.profile.goals, ctx.discipline.level), natural, intensity) },
      minMinutes: 30,
      preferredMinutes: 60,
      canBeAddOn: false,
    }));
  },

  generate(req: GenerateRequest): SessionPlan {
    const split = req.slot.variant as Split;
    const { availability: ctx, discipline } = req;
    const p = prescriptionFor(req.profile.goals, discipline.level);
    const scale = (sets: number) => Math.max(2, Math.round(sets * req.volumeFactor));
    const notes: string[] = [];

    const warmup = warmupBlock(ctx);
    const cooldown = cooldownBlock(ctx, split === "lower" ? "lower" : split === "upper" ? "upper" : "full");
    const budgetMin = req.durationMin - estimateMinutes(compact([warmup, cooldown]));

    const main: Block[] = [];
    const used = new Set<string>();
    SPLIT_PATTERNS[split].forEach((pattern, i) => {
      const pool = candidates({ discipline: "strength_training", pattern, maxLevel: discipline.level }, ctx).filter((e) => !used.has(e.id));
      if (!pool.length) {
        notes.push(`Aucun exercice « ${pattern} » réalisable avec votre matériel : mouvement omis.`);
        return;
      }
      // Rotation entre séances de même type pour varier les stimulus.
      const ex = pool[(req.slot.index + req.weekIndex) % Math.min(pool.length, 2)]!;
      used.add(ex.id);
      const isMain = i < 2 && pattern !== "core";
      main.push(
        isMain
          ? exerciseBlock(ex, scale(p.mainSets), p.mainReps, p.mainRest, p.rpe, ctx)
          : exerciseBlock(ex, scale(p.accSets), p.accReps, p.accRest, p.rpe - 1, ctx),
      );
    });

    // Ajuster au temps disponible : retirer d'abord des séries d'accessoires, puis des exercices (≥ 2 conservés).
    const fits = () => estimateMinutes(main) <= budgetMin;
    while (!fits() && main.length > 2) {
      const last = main[main.length - 1]!;
      if ("sets" in last && last.sets > 2) last.sets -= 1;
      else main.pop();
    }
    if (!fits()) notes.push("Temps disponible court : séance condensée, envisagez un créneau plus long.");

    const blocks = compact([warmup, ...main, cooldown]);
    return {
      id: req.sessionId,
      disciplineId: "strength_training",
      title: `Musculation — ${SPLIT_TITLE[split]}`,
      focus: split,
      intensity: req.slot.intensity,
      estimatedMinutes: estimateMinutes(blocks),
      load: req.slot.load,
      blocks,
      notes,
    };
  },
};
