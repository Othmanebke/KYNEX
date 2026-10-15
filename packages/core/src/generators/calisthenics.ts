import { estimateMinutes, type Block, type SessionPlan, type TrainingLoad } from "../blocks/schema.js";
import type { Level } from "../domain/enums.js";
import { isFeasible, type AvailabilityContext } from "../exercises/filter.js";
import { getExercise } from "../exercises/library.js";
import type { Exercise } from "../exercises/schema.js";
import { compact, cooldownBlock, warmupBlock } from "./common.js";
import { capIntensity, cnsAfterCap, type GenerateRequest, type SessionGenerator, type SlotSpec, type WeekContext } from "./types.js";

/**
 * Échelles de progression : du plus accessible au plus avancé. Le générateur choisit
 * le palier le plus élevé autorisé par le niveau ET réalisable avec le matériel.
 */
export const LADDERS = {
  push: ["incline_push_up", "push_up", "diamond_push_up", "archer_push_up"],
  dip: ["bench_dip", "pike_push_up", "parallel_bar_dip", "wall_handstand_hold"],
  pull: ["australian_row", "negative_pull_up", "pull_up", "l_sit_pull_up"],
  legs: ["bodyweight_squat", "split_squat", "bulgarian_split_squat", "pistol_squat"],
  core: ["plank", "hollow_hold", "hanging_knee_raise", "l_sit"],
} as const;
type Ladder = keyof typeof LADDERS;

const MAX_STEP: Record<Level, number> = { beginner: 1, intermediate: 2, advanced: 3 };

export function pickFromLadder(ladder: Ladder, level: Level, ctx: AvailabilityContext): Exercise | null {
  const steps = LADDERS[ladder];
  for (let i = Math.min(MAX_STEP[level], steps.length - 1); i >= 0; i--) {
    const ex = getExercise(steps[i]!);
    if (isFeasible(ex, ctx)) return ex;
  }
  return null;
}

type Variant = "push" | "pull" | "legs_core" | "full";
const VARIANT_LADDERS: Record<Variant, Ladder[]> = {
  push: ["push", "dip", "core"],
  pull: ["pull", "core", "legs"],
  legs_core: ["legs", "core", "push"],
  full: ["push", "pull", "legs", "core"],
};
const VARIANT_LOAD: Record<Variant, TrainingLoad> = {
  push: { lowerBody: 0, upperBody: 3, cardio: 1, impact: 0, cns: 1 },
  pull: { lowerBody: 1, upperBody: 3, cardio: 1, impact: 0, cns: 1 },
  legs_core: { lowerBody: 2, upperBody: 1, cardio: 1, impact: 1, cns: 1 },
  full: { lowerBody: 2, upperBody: 2, cardio: 1, impact: 0, cns: 1 },
};
const TITLE: Record<Variant, string> = { push: "Poussée", pull: "Tirage", legs_core: "Jambes & gainage", full: "Full body" };

export const calisthenicsGenerator: SessionGenerator = {
  disciplineId: "calisthenics",
  variants: TITLE,

  planSlots(count: number, ctx: WeekContext): SlotSpec[] {
    const canPull = pickFromLadder("pull", ctx.discipline.level, ctx.availability) !== null;
    const natural = ctx.discipline.level === "beginner" ? "moderate" : "high";
    const rotation: Variant[] = count >= 3 && canPull ? ["push", "pull", "legs_core"] : ["full"];
    return Array.from({ length: count }, (_, index) => {
      const variant = rotation[index % rotation.length]!;
      return {
        disciplineId: "calisthenics",
        variant,
        index,
        intensity: capIntensity(natural, ctx.intensityCap),
        // Figures et progressions avancées : sollicitation nerveuse plus forte.
        load: { ...VARIANT_LOAD[variant], cns: cnsAfterCap(ctx.discipline.level === "advanced" ? 2 : 1, natural, capIntensity(natural, ctx.intensityCap)) },
        minMinutes: 25,
        preferredMinutes: 50,
        canBeAddOn: false,
      };
    });
  },

  generate(req: GenerateRequest): SessionPlan {
    const variant = req.slot.variant as Variant;
    const { level } = req.discipline;
    const ctx = req.availability;
    const notes: string[] = [];
    const sets = Math.max(2, Math.round((level === "beginner" ? 3 : 4) * req.volumeFactor));
    const reps = level === "advanced" ? { min: 5, max: 8 } : { min: 6, max: 12 };

    const main: Block[] = [];
    if (level === "advanced" && variant !== "legs_core") {
      const skill = variant === "pull" ? getExercise("l_sit_pull_up") : getExercise("wall_handstand_hold");
      if (isFeasible(skill, ctx)) main.push({ kind: "technique", exerciseId: skill.id, durationMin: 10, focus: `Travail de compétence : ${skill.name}` });
    }
    for (const ladder of VARIANT_LADDERS[variant]) {
      const ex = pickFromLadder(ladder, level, ctx);
      if (!ex) {
        notes.push(`Aucune progression « ${ladder} » réalisable avec votre matériel (ex : barre de traction) : bloc omis.`);
        continue;
      }
      const hold = ex.progressionMeasures.includes("hold_sec");
      main.push(
        hold
          ? { kind: "timed", exerciseId: ex.id, sets, durationSec: level === "beginner" ? 20 : 30, restSec: 60, targetRpe: 8 }
          : { kind: "sets_reps", exerciseId: ex.id, sets, reps, restSec: level === "beginner" ? 90 : 120, targetRpe: 8, perSide: ex.id.includes("split") || ex.id === "pistol_squat" },
      );
    }

    const warmup = warmupBlock(ctx, [{ id: "wall_slide", reps: 10 }]);
    const cooldown = cooldownBlock(ctx, variant === "legs_core" ? "lower" : "upper");
    const budget = req.durationMin - estimateMinutes(compact([warmup, cooldown]));
    while (estimateMinutes(main) > budget && main.length > 2) {
      const last = main[main.length - 1]!;
      if ("sets" in last && last.sets > 2) last.sets -= 1;
      else main.pop();
    }

    const blocks = compact([warmup, ...main, cooldown]);
    return {
      id: req.sessionId,
      disciplineId: "calisthenics",
      title: `Street workout — ${TITLE[variant]}`,
      focus: variant,
      intensity: req.slot.intensity,
      estimatedMinutes: estimateMinutes(blocks),
      load: req.slot.load,
      blocks,
      notes,
    };
  },
};
