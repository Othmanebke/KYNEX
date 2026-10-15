import { estimateMinutes, type Block, type SessionPlan, type TrainingLoad } from "../blocks/schema.js";
import type { Intensity, Level } from "../domain/enums.js";
import { compact, cooldownBlock, flowItems } from "./common.js";
import { capIntensity, type GenerateRequest, type SessionGenerator, type SlotSpec, type WeekContext } from "./types.js";

type RunVariant = "run_walk" | "easy" | "long" | "tempo" | "intervals";

/** Volume hebdomadaire de départ (minutes de course) selon le niveau. */
const BASE_WEEKLY_MIN: Record<Level, number> = { beginner: 60, intermediate: 120, advanced: 200 };

/**
 * Progression prudente : +8 %/semaine (sous la règle des 10 %), semaine allégée
 * toutes les 4 semaines (-20 %), plafond à +50 % du volume initial par cycle.
 */
export function weeklyRunMinutes(level: Level, weekIndex: number): number {
  const deload = weekIndex % 4 === 3;
  const progressWeeks = weekIndex - Math.floor((weekIndex + 1) / 4);
  const factor = Math.min(1.5, 1 + 0.08 * progressWeeks) * (deload ? 0.8 : 1);
  return Math.round(BASE_WEEKLY_MIN[level] * factor);
}

/** Durée maximale d'une séance hors sortie longue (minutes de course). */
const MAX_REGULAR_RUN_MIN: Record<Level, number> = { beginner: 35, intermediate: 50, advanced: 70 };

const LOAD: Record<RunVariant, TrainingLoad> = {
  run_walk: { lowerBody: 1, upperBody: 0, cardio: 2, impact: 1, cns: 0 },
  easy: { lowerBody: 1, upperBody: 0, cardio: 2, impact: 2, cns: 0 },
  long: { lowerBody: 2, upperBody: 0, cardio: 2, impact: 3, cns: 1 },
  tempo: { lowerBody: 2, upperBody: 0, cardio: 3, impact: 2, cns: 1 },
  intervals: { lowerBody: 2, upperBody: 0, cardio: 3, impact: 3, cns: 2 },
};

const INTENSITY: Record<RunVariant, Intensity> = { run_walk: "low", easy: "low", long: "moderate", tempo: "high", intervals: "high" };

const TITLE: Record<RunVariant, string> = {
  run_walk: "Course-marche",
  easy: "Footing facile",
  long: "Sortie longue",
  tempo: "Tempo au seuil",
  intervals: "Fractionné",
};

/**
 * Règles hebdomadaires : majorité de volume facile, au plus une séance de qualité
 * (deux pour un niveau avancé à ≥ 5 séances), une sortie longue dès 2 séances.
 * Les débutants restent en course-marche les 6 premières semaines.
 */
export function chooseRunVariants(count: number, level: Level, weekIndex: number, speedGoal: boolean): RunVariant[] {
  if (level === "beginner" && weekIndex < 6) return Array.from({ length: count }, () => "run_walk");
  const quality: RunVariant = speedGoal || weekIndex % 2 === 1 ? "intervals" : "tempo";
  const otherQuality: RunVariant = quality === "intervals" ? "tempo" : "intervals";
  const canQuality = level !== "beginner";
  const out: RunVariant[] = [];
  if (count >= 2) out.push("long");
  if (canQuality && count >= 2) out.push(quality);
  if (level === "advanced" && count >= 5) out.push(otherQuality);
  while (out.length < count) out.push("easy");
  return out.slice(0, count);
}

export const runningGenerator: SessionGenerator = {
  disciplineId: "running",
  variants: TITLE,

  planSlots(count: number, ctx: WeekContext): SlotSpec[] {
    const level = ctx.discipline.level;
    const speedGoal = ctx.profile.goals.includes("speed");
    const weekly = weeklyRunMinutes(level, ctx.weekIndex) * ctx.volumeFactor;
    let variants = chooseRunVariants(count, level, ctx.weekIndex, speedGoal);
    // État de forme : la qualité est remplacée par du facile plutôt que d'être simplement plafonnée.
    if (ctx.intensityCap !== "high") variants = variants.map((v) => (v === "tempo" || v === "intervals" ? "easy" : v));
    const longShare = variants.includes("long") ? 0.35 : 0;
    const longMin = weekly * longShare;
    const perOther = (weekly * (1 - longShare)) / Math.max(1, variants.filter((v) => v !== "long").length);
    // Une séance courante ne dépasse jamais la sortie longue ni le plafond du niveau.
    const otherCap = Math.min(MAX_REGULAR_RUN_MIN[level], longMin ? longMin * 0.8 : Infinity);
    return variants.map((variant, index) => {
      const target = variant === "long" ? longMin : Math.min(perOther, otherCap);
      return {
        disciplineId: "running",
        variant,
        index,
        intensity: capIntensity(INTENSITY[variant], ctx.intensityCap),
        load: LOAD[variant],
        minMinutes: variant === "long" ? 45 : 25,
        // Durée totale : course + ~10 min d'échauffement et retour au calme.
        preferredMinutes: Math.max(25, Math.round(target / 5) * 5 + 10),
        canBeAddOn: false,
      };
    });
  },

  generate(req: GenerateRequest): SessionPlan {
    const variant = req.slot.variant as RunVariant;
    const ctx = req.availability;
    const total = req.durationMin;
    const notes: string[] = [];

    const warmup = flowItems(
      [
        { id: "leg_swings", reps: 10, perSide: true },
        { id: "ankle_rocks", reps: 10, perSide: true },
        { id: "worlds_greatest_stretch", reps: 3, perSide: true },
      ],
      ctx,
    );
    const warmupBlock: Block | null = warmup.length ? { kind: "warmup", label: "Échauffement dynamique", items: warmup } : null;
    const cooldown = cooldownBlock(ctx, "lower");
    const structureMin = estimateMinutes(compact([warmupBlock, cooldown]));
    const runMin = Math.max(10, total - structureMin);

    const main: Block[] = [];
    switch (variant) {
      case "run_walk": {
        // Ratio course/marche croissant au fil des semaines.
        const runSec = Math.min(300, 60 + req.weekIndex * 30);
        const walkSec = Math.max(60, 120 - req.weekIndex * 10);
        main.push({
          kind: "intervals",
          exerciseId: "run_walk",
          repeats: Math.max(3, Math.floor((runMin * 60) / (runSec + walkSec))),
          workSec: runSec,
          restSec: walkSec,
          restMode: "walk",
          intensity: "low",
          targetRpe: 4,
          label: "Course facile / marche active",
        });
        break;
      }
      case "easy":
      case "long": {
        const strides = variant === "easy" && req.discipline.level !== "beginner" && runMin >= 25;
        const stridesMin = strides ? 6 : 0;
        main.push({
          kind: "outdoor",
          exerciseId: variant === "long" ? "long_run" : "easy_run",
          targetDurationMin: runMin - stridesMin,
          terrain: "mixed",
          intensity: variant === "long" ? "moderate" : "low",
          targetRpe: variant === "long" ? 5 : 4,
        });
        if (strides) {
          main.push({ kind: "intervals", exerciseId: "strides", repeats: 4, workSec: 20, restSec: 70, restMode: "walk", intensity: "moderate", label: "Lignes droites" });
        }
        break;
      }
      case "tempo": {
        const tempoMin = Math.max(10, Math.min(30, Math.round(runMin * 0.5)));
        const easyMin = Math.max(5, Math.round((runMin - tempoMin) / 2));
        main.push(
          { kind: "timed", exerciseId: "easy_run", sets: 1, durationSec: easyMin * 60, restSec: 0, label: "Mise en route" },
          { kind: "timed", exerciseId: "tempo_run", sets: 1, durationSec: tempoMin * 60, restSec: 0, targetRpe: 7 },
          { kind: "timed", exerciseId: "easy_run", sets: 1, durationSec: easyMin * 60, restSec: 0, label: "Retour progressif" },
        );
        break;
      }
      case "intervals": {
        const easyMin = Math.max(8, Math.round(runMin * 0.3));
        const workSec = req.discipline.level === "advanced" ? 180 : 120;
        const restSec = Math.round(workSec * 0.75);
        const repeats = Math.max(3, Math.min(8, Math.floor(((runMin - easyMin * 1.5) * 60) / (workSec + restSec))));
        main.push(
          { kind: "timed", exerciseId: "easy_run", sets: 1, durationSec: easyMin * 60, restSec: 0, label: "Mise en route" },
          { kind: "intervals", exerciseId: "interval_run", repeats, workSec, restSec, restMode: "jog", intensity: "high", targetRpe: 8 },
          { kind: "timed", exerciseId: "easy_run", sets: 1, durationSec: Math.round(easyMin * 0.5) * 60, restSec: 0, label: "Retour au calme courant" },
        );
        break;
      }
    }
    if (req.durationMin < req.slot.minMinutes) notes.push("Créneau plus court que recommandé pour ce type de sortie.");

    const blocks = compact([warmupBlock, ...main, cooldown]);
    return {
      id: req.sessionId,
      disciplineId: "running",
      title: `Course — ${TITLE[variant]}`,
      focus: variant,
      intensity: req.slot.intensity,
      estimatedMinutes: estimateMinutes(blocks),
      load: req.slot.load,
      blocks,
      notes,
    };
  },
};
