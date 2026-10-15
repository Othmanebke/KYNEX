import { estimateMinutes, type Block, type Movement, type SessionPlan } from "../blocks/schema.js";
import type { Level, MovementPattern } from "../domain/enums.js";
import { candidates, type AvailabilityContext } from "../exercises/filter.js";
import type { Exercise } from "../exercises/schema.js";
import { compact, cooldownBlock, warmupBlock } from "./common.js";
import { capIntensity, cnsAfterCap, type GenerateRequest, type SessionGenerator, type SlotSpec, type WeekContext } from "./types.js";

type Format = "intervals" | "amrap" | "emom" | "circuit";
const FORMATS: Format[] = ["intervals", "amrap", "circuit", "emom"];
const TITLE: Record<Format, string> = { intervals: "Intervalles", amrap: "AMRAP", emom: "EMOM", circuit: "Circuit" };

/** Ratio travail/repos par niveau (secondes). */
const WORK_REST: Record<Level, [number, number]> = { beginner: [30, 30], intermediate: [40, 20], advanced: [45, 15] };
const REPS: Record<Level, number> = { beginner: 8, intermediate: 12, advanced: 15 };

/** Familles de mouvements alternées pour répartir la fatigue dans un circuit. */
const PATTERN_ORDER: MovementPattern[][] = [
  ["full_body", "jump", "locomotion"],
  ["squat", "lunge"],
  ["core"],
  ["hinge", "horizontal_push"],
];

export function pickMoves(level: Level, ctx: AvailabilityContext, offset: number, count: number): Exercise[] {
  const picked: Exercise[] = [];
  for (let i = 0; picked.length < count && i < PATTERN_ORDER.length * 2; i++) {
    const patterns = PATTERN_ORDER[i % PATTERN_ORDER.length]!;
    const pool = patterns
      .flatMap((pattern) => candidates({ discipline: "hiit", pattern, maxLevel: level }, ctx))
      .filter((e) => !picked.some((p) => p.id === e.id));
    if (pool.length) picked.push(pool[(offset + i) % pool.length]!);
  }
  return picked;
}

const repMove = (ex: Exercise, reps: number): Movement =>
  ex.progressionMeasures.includes("reps") ? { exerciseId: ex.id, reps } : { exerciseId: ex.id, durationSec: 30 };

export const hiitGenerator: SessionGenerator = {
  disciplineId: "hiit",
  variants: TITLE,

  planSlots(count: number, ctx: WeekContext): SlotSpec[] {
    const lowImpact = ctx.availability.lowImpact;
    const natural = ctx.discipline.level === "beginner" ? "moderate" : "high";
    const intensity = capIntensity(natural, ctx.intensityCap);
    return Array.from({ length: count }, (_, index) => ({
      disciplineId: "hiit",
      variant: FORMATS[(index + ctx.weekIndex) % FORMATS.length]!,
      index,
      intensity,
      load: { lowerBody: 2, upperBody: 1, cardio: 3, impact: lowImpact ? 1 : 2, cns: cnsAfterCap(ctx.discipline.level === "beginner" ? 1 : 2, natural, intensity) },
      minMinutes: 20,
      preferredMinutes: 35,
      canBeAddOn: false,
    }));
  },

  generate(req: GenerateRequest): SessionPlan {
    const format = req.slot.variant as Format;
    const { level } = req.discipline;
    const ctx = req.availability;
    const notes: string[] = [];
    const warmup = warmupBlock(ctx);
    const cooldown = cooldownBlock(ctx, "full");
    const workMin = Math.max(8, Math.round((req.durationMin - estimateMinutes(compact([warmup, cooldown]))) * req.volumeFactor));
    const moves = pickMoves(level, ctx, req.slot.index + req.weekIndex, 4);
    if (moves.length < 2) {
      throw new Error("Pas assez de mouvements réalisables pour construire une séance HIIT.");
    }
    if (ctx.lowImpact) notes.push("Version sans sauts (contrainte « faible impact »).");

    const [work, rest] = WORK_REST[level];
    const reps = REPS[level];
    let main: Block;
    switch (format) {
      case "intervals": {
        const roundSec = moves.length * (work + rest) + 60;
        main = {
          kind: "circuit",
          label: `${work}s effort / ${rest}s récupération`,
          rounds: Math.max(2, Math.floor((workMin * 60) / roundSec)),
          movements: moves.map((m) => ({ exerciseId: m.id, durationSec: work })),
          restBetweenMovementsSec: rest,
          restBetweenRoundsSec: 60,
          targetRpe: 8,
        };
        break;
      }
      case "amrap":
        main = { kind: "amrap", durationMin: Math.min(20, workMin), movements: moves.map((m) => repMove(m, reps)), targetRpe: 8 };
        break;
      case "emom": {
        const pair = moves.slice(0, 2);
        main = {
          kind: "emom",
          label: "Alterner les mouvements chaque minute",
          minutes: Math.min(20, workMin),
          movements: pair.map((m) => repMove(m, Math.round(reps * 0.8))),
          targetRpe: 7,
        };
        break;
      }
      case "circuit": {
        const roundSec = moves.length * (reps * 3.5 + 15) + 90;
        main = {
          kind: "circuit",
          rounds: Math.max(2, Math.floor((workMin * 60) / roundSec)),
          movements: moves.map((m) => repMove(m, reps)),
          restBetweenMovementsSec: 15,
          restBetweenRoundsSec: 90,
          targetRpe: 7,
        };
        break;
      }
    }

    const blocks = compact([warmup, main, cooldown]);
    return {
      id: req.sessionId,
      disciplineId: "hiit",
      title: `HIIT — ${TITLE[format]}`,
      focus: format,
      intensity: req.slot.intensity,
      estimatedMinutes: estimateMinutes(blocks),
      load: req.slot.load,
      blocks,
      notes,
    };
  },
};
