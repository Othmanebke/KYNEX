import { estimateMinutes, type Block, type SessionPlan } from "../blocks/schema.js";
import { flowItems } from "./common.js";
import { capIntensity, type GenerateRequest, type SessionGenerator, type SlotSpec, type WeekContext } from "./types.js";

type Focus = "full_body" | "hips_legs" | "shoulders_spine";
const FOCUSES: Focus[] = ["full_body", "hips_legs", "shoulders_spine"];
const TITLE: Record<Focus, string> = { full_body: "Corps entier", hips_legs: "Hanches & jambes", shoulders_spine: "Épaules & colonne" };

const ROUTINES: Record<Focus, Array<{ id: string; durationSec?: number; reps?: number; perSide?: boolean }>> = {
  full_body: [
    { id: "cat_cow", reps: 10 },
    { id: "worlds_greatest_stretch", reps: 5, perSide: true },
    { id: "hip_90_90", reps: 8 },
    { id: "thoracic_open_book", reps: 8, perSide: true },
    { id: "deep_squat_hold", durationSec: 60 },
    { id: "hamstring_stretch", durationSec: 45, perSide: true },
  ],
  hips_legs: [
    { id: "leg_swings", reps: 12, perSide: true },
    { id: "hip_90_90", reps: 10 },
    { id: "couch_stretch", durationSec: 60, perSide: true },
    { id: "deep_squat_hold", durationSec: 60 },
    { id: "ankle_rocks", reps: 12, perSide: true },
    { id: "hamstring_stretch", durationSec: 60, perSide: true },
    { id: "standing_calf_stretch", durationSec: 45, perSide: true },
  ],
  shoulders_spine: [
    { id: "cat_cow", reps: 10 },
    { id: "arm_circles", reps: 15 },
    { id: "wall_slide", reps: 12 },
    { id: "band_dislocate", reps: 12 },
    { id: "thoracic_open_book", reps: 10, perSide: true },
    { id: "dead_bug", reps: 10 },
  ],
};

export const mobilityGenerator: SessionGenerator = {
  disciplineId: "mobility",
  variants: TITLE,

  planSlots(count: number, ctx: WeekContext): SlotSpec[] {
    return Array.from({ length: count }, (_, index) => ({
      disciplineId: "mobility",
      variant: FOCUSES[(index + ctx.weekIndex) % FOCUSES.length]!,
      index,
      intensity: capIntensity("low", ctx.intensityCap),
      load: { lowerBody: 0, upperBody: 0, cardio: 0, impact: 0, cns: 0 },
      minMinutes: 10,
      preferredMinutes: 20,
      canBeAddOn: true,
    }));
  },

  generate(req: GenerateRequest): SessionPlan {
    const focus = req.slot.variant as Focus;
    const items = flowItems(ROUTINES[focus], req.availability);
    const notes: string[] = [];
    if (items.length < ROUTINES[focus].length) notes.push("Certains exercices ont été retirés (matériel ou zone sensible).");
    if (!items.length) throw new Error("Aucun exercice de mobilité réalisable avec les contraintes actuelles.");

    // Répéter la routine autant que le temps le permet (au moins un tour).
    const one: Block = { kind: "mobility", label: TITLE[focus], items };
    const perRound = estimateMinutes([one]);
    const rounds = Math.max(1, Math.min(3, Math.floor(req.durationMin / Math.max(1, perRound))));
    const blocks: Block[] = Array.from({ length: rounds }, (_, i) => ({ ...one, label: `${TITLE[focus]} — tour ${i + 1}` }));
    const relax = flowItems([{ id: "childs_pose", durationSec: 90 }], req.availability);
    if (relax.length) blocks.push({ kind: "cooldown", label: "Respiration", items: relax });

    return {
      id: req.sessionId,
      disciplineId: "mobility",
      title: `Mobilité — ${TITLE[focus]}`,
      focus,
      intensity: req.slot.intensity,
      estimatedMinutes: estimateMinutes(blocks),
      load: req.slot.load,
      blocks,
      notes,
    };
  },
};
