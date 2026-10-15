import { z } from "zod";
import { IntensitySchema } from "../domain/enums.js";

const id = z.string().min(1);
const posInt = z.number().int().positive();
const nonNegInt = z.number().int().nonnegative();
const rpe = z.number().min(1).max(10);

export const RepsSchema = z.union([
  posInt,
  z
    .object({ min: posInt, max: posInt })
    .refine((r) => r.min <= r.max, "reps.min doit être ≤ reps.max"),
]);
export type Reps = z.infer<typeof RepsSchema>;

export const LoadSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("absolute"), kg: z.number().positive() }),
  z.object({ type: z.literal("percent_1rm"), percent: z.number().min(30).max(105) }),
  /** Charge choisie pour terminer la série à l'effort perçu indiqué (RPE). */
  z.object({ type: z.literal("rpe"), rpe }),
]);
export type Load = z.infer<typeof LoadSchema>;

/** Mouvement d'un circuit / EMOM / AMRAP : exactement une mesure de travail. */
export const MovementSchema = z
  .object({
    exerciseId: id,
    reps: posInt.optional(),
    durationSec: posInt.optional(),
    distanceM: posInt.optional(),
    load: LoadSchema.optional(),
  })
  .refine(
    (m) => [m.reps, m.durationSec, m.distanceM].filter((x) => x !== undefined).length === 1,
    "un mouvement doit définir exactement une mesure : reps, durationSec ou distanceM",
  );
export type Movement = z.infer<typeof MovementSchema>;

const base = {
  label: z.string().optional(),
  notes: z.string().optional(),
  targetRpe: rpe.optional(),
};

const FlowItemSchema = z
  .object({ exerciseId: id, durationSec: posInt.optional(), reps: posInt.optional(), perSide: z.boolean().optional() })
  .refine((m) => (m.durationSec === undefined) !== (m.reps === undefined), "durationSec ou reps (un seul)");
export type FlowItem = z.infer<typeof FlowItemSchema>;

export const BlockSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("sets_reps"), ...base, exerciseId: id, sets: posInt, reps: RepsSchema, restSec: nonNegInt, perSide: z.boolean().optional() }),
  z.object({ kind: z.literal("loaded_sets"), ...base, exerciseId: id, sets: posInt, reps: RepsSchema, load: LoadSchema, restSec: nonNegInt }),
  z.object({ kind: z.literal("timed"), ...base, exerciseId: id, sets: posInt.default(1), durationSec: posInt, restSec: nonNegInt.default(0) }),
  z.object({
    kind: z.literal("distance"),
    ...base,
    exerciseId: id,
    distanceM: posInt,
    /** Allure cible en secondes par km, uniquement si l'utilisateur dispose d'une référence. */
    targetPaceSecPerKm: posInt.optional(),
    intensity: IntensitySchema,
  }),
  z
    .object({
      kind: z.literal("intervals"),
      ...base,
      exerciseId: id,
      repeats: posInt,
      workSec: posInt.optional(),
      workDistanceM: posInt.optional(),
      restSec: nonNegInt,
      restMode: z.enum(["passive", "walk", "jog"]).default("passive"),
      intensity: IntensitySchema,
    })
    .refine((b) => (b.workSec === undefined) !== (b.workDistanceM === undefined), "workSec ou workDistanceM (un seul)"),
  z.object({ kind: z.literal("circuit"), ...base, rounds: posInt, movements: z.array(MovementSchema).min(2), restBetweenMovementsSec: nonNegInt, restBetweenRoundsSec: nonNegInt }),
  z.object({ kind: z.literal("emom"), ...base, minutes: posInt, movements: z.array(MovementSchema).min(1) }),
  z.object({ kind: z.literal("amrap"), ...base, durationMin: posInt, movements: z.array(MovementSchema).min(1) }),
  z.object({ kind: z.literal("technique"), ...base, exerciseId: id.optional(), durationMin: posInt, focus: z.string().min(1) }),
  z.object({ kind: z.literal("warmup"), ...base, items: z.array(FlowItemSchema).min(1) }),
  z.object({ kind: z.literal("mobility"), ...base, items: z.array(FlowItemSchema).min(1) }),
  z.object({ kind: z.literal("cooldown"), ...base, items: z.array(FlowItemSchema).min(1) }),
  z.object({ kind: z.literal("rest"), ...base, durationSec: posInt }),
  z
    .object({
      kind: z.literal("outdoor"),
      ...base,
      exerciseId: id,
      targetDurationMin: posInt.optional(),
      targetDistanceM: posInt.optional(),
      terrain: z.enum(["road", "trail", "track", "mixed"]).optional(),
      intensity: IntensitySchema,
    })
    .refine((b) => b.targetDurationMin !== undefined || b.targetDistanceM !== undefined, "durée ou distance cible requise"),
]);
export type Block = z.infer<typeof BlockSchema>;
export type BlockInput = z.input<typeof BlockSchema>;

/** Sollicitation estimée d'une séance (0 = nulle, 3 = forte), utilisée par l'orchestrateur. */
export const TrainingLoadSchema = z.object({
  lowerBody: z.number().int().min(0).max(3),
  upperBody: z.number().int().min(0).max(3),
  cardio: z.number().int().min(0).max(3),
  impact: z.number().int().min(0).max(3),
  /**
   * Stress nerveux central (SNC) : charges lourdes proches du max, sprints/fractionné,
   * pliométrie, figures avancées. Il se cumule à l'échelle de la semaine, toutes disciplines confondues.
   */
  cns: z.number().int().min(0).max(3),
});
export type TrainingLoad = z.infer<typeof TrainingLoadSchema>;

export const SessionPlanSchema = z.object({
  id: id,
  disciplineId: id,
  title: z.string().min(1),
  focus: z.string().optional(),
  intensity: IntensitySchema,
  estimatedMinutes: posInt,
  load: TrainingLoadSchema,
  blocks: z.array(BlockSchema).min(1),
  /** Remarques visibles : substitutions de matériel, adaptations liées à la fatigue, etc. */
  notes: z.array(z.string()).default([]),
});
export type SessionPlan = z.infer<typeof SessionPlanSchema>;

const avgReps = (r: Reps): number => (typeof r === "number" ? r : (r.min + r.max) / 2);
const SEC_PER_REP = 3.5;

function movementSec(m: Movement): number {
  if (m.durationSec) return m.durationSec;
  if (m.reps) return m.reps * SEC_PER_REP;
  // Distance d'un mouvement de circuit : ~ allure de course modérée (6 min/km).
  return ((m.distanceM ?? 0) / 1000) * 360;
}

/** Estimation de la durée d'un bloc, en secondes. Les durées libres sont comptées pour leur cible. */
export function estimateBlockSeconds(b: Block, paceSecPerKm = 390): number {
  switch (b.kind) {
    case "sets_reps":
      return b.sets * (avgReps(b.reps) * SEC_PER_REP * (b.perSide ? 2 : 1) + b.restSec);
    case "loaded_sets":
      return b.sets * (avgReps(b.reps) * SEC_PER_REP + b.restSec);
    case "timed":
      return b.sets * (b.durationSec + b.restSec);
    case "distance":
      return (b.distanceM / 1000) * (b.targetPaceSecPerKm ?? paceSecPerKm);
    case "intervals": {
      const work = b.workSec ?? ((b.workDistanceM ?? 0) / 1000) * paceSecPerKm * 0.85;
      return b.repeats * (work + b.restSec);
    }
    case "circuit": {
      const perRound = b.movements.reduce((s, m) => s + movementSec(m), 0) + b.restBetweenMovementsSec * (b.movements.length - 1);
      return b.rounds * perRound + b.restBetweenRoundsSec * (b.rounds - 1);
    }
    case "emom":
      return b.minutes * 60;
    case "amrap":
      return b.durationMin * 60;
    case "technique":
      return b.durationMin * 60;
    case "warmup":
    case "mobility":
    case "cooldown":
      return b.items.reduce((s, i) => s + (i.durationSec ?? (i.reps ?? 0) * 3) * (i.perSide ? 2 : 1), 0);
    case "rest":
      return b.durationSec;
    case "outdoor":
      return b.targetDurationMin ? b.targetDurationMin * 60 : ((b.targetDistanceM ?? 0) / 1000) * paceSecPerKm;
  }
}

export function estimateMinutes(blocks: Block[]): number {
  return Math.max(1, Math.round(blocks.reduce((s, b) => s + estimateBlockSeconds(b), 0) / 60));
}

/** Identifiants d'exercices référencés par un bloc. */
export function blockExerciseIds(b: Block): string[] {
  switch (b.kind) {
    case "circuit":
    case "emom":
    case "amrap":
      return b.movements.map((m) => m.exerciseId);
    case "warmup":
    case "mobility":
    case "cooldown":
      return b.items.map((i) => i.exerciseId);
    case "technique":
      return b.exerciseId ? [b.exerciseId] : [];
    case "rest":
      return [];
    default:
      return [b.exerciseId];
  }
}
