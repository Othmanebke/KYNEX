import type { Block, FlowItem } from "../blocks/schema.js";
import { resolveExercise, type AvailabilityContext } from "../exercises/filter.js";

/** Construit une liste d'items d'échauffement/mobilité en ne gardant que les exercices faisables. */
export function flowItems(
  wanted: Array<{ id: string; durationSec?: number; reps?: number; perSide?: boolean }>,
  ctx: AvailabilityContext,
): FlowItem[] {
  const items: FlowItem[] = [];
  const used = new Set<string>();
  for (const w of wanted) {
    const r = resolveExercise(w.id, ctx);
    if (!r || used.has(r.exercise.id)) continue;
    used.add(r.exercise.id);
    const item: FlowItem = { exerciseId: r.exercise.id, ...(w.durationSec ? { durationSec: w.durationSec } : { reps: w.reps ?? 10 }) };
    if (w.perSide) item.perSide = true;
    items.push(item);
  }
  return items;
}

const GENERIC_WARMUP = [
  { id: "arm_circles", reps: 10 },
  { id: "leg_swings", reps: 10, perSide: true },
  { id: "cat_cow", reps: 8 },
  { id: "worlds_greatest_stretch", reps: 4, perSide: true },
  { id: "bodyweight_squat", reps: 10 },
];

export function warmupBlock(ctx: AvailabilityContext, extra: Parameters<typeof flowItems>[0] = []): Block | null {
  const items = flowItems([...GENERIC_WARMUP, ...extra], ctx);
  return items.length ? { kind: "warmup", label: "Échauffement", items } : null;
}

export function cooldownBlock(ctx: AvailabilityContext, focus: "lower" | "upper" | "full" = "full"): Block | null {
  const lower = [
    { id: "couch_stretch", durationSec: 45, perSide: true },
    { id: "hamstring_stretch", durationSec: 45, perSide: true },
    { id: "standing_calf_stretch", durationSec: 30, perSide: true },
  ];
  const upper = [
    { id: "thoracic_open_book", reps: 6, perSide: true },
    { id: "wall_slide", reps: 10 },
  ];
  const wanted = focus === "lower" ? lower : focus === "upper" ? upper : [...upper.slice(0, 1), ...lower.slice(0, 2)];
  const items = flowItems([...wanted, { id: "childs_pose", durationSec: 60 }], ctx);
  return items.length ? { kind: "cooldown", label: "Retour au calme", items } : null;
}

export const compact = <T>(xs: Array<T | null | undefined>): T[] => xs.filter((x): x is T => x != null);

