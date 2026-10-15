import { estimateMinutes, type Block, type Movement, type SessionPlan } from "../blocks/schema.js";
import type { Level } from "../domain/enums.js";
import { isFeasible, type AvailabilityContext } from "../exercises/filter.js";
import { getExercise } from "../exercises/library.js";
import type { Exercise } from "../exercises/schema.js";
import { compact, cooldownBlock, warmupBlock } from "./common.js";
import { capIntensity, cnsAfterCap, type GenerateRequest, type SessionGenerator, type SlotSpec, type WeekContext } from "./types.js";

/**
 * Hybride type HYROX (couverture `beta`) : l'enjeu spécifique est de courir en état de
 * fatigue après un atelier (« compromised running »). Trois séances types :
 * - `compromised` : alternance course + atelier, le cœur de la discipline ;
 * - `stations` : ateliers de force-endurance enchaînés, peu de course ;
 * - `run_engine` : fractionné long pour développer le moteur aérobie.
 */
type Variant = "compromised" | "stations" | "run_engine";
const ROTATION: Variant[] = ["compromised", "stations", "run_engine"];
const TITLE: Record<Variant, string> = { compromised: "Course compromise", stations: "Ateliers force-endurance", run_engine: "Moteur aérobie" };

/** Ateliers par ordre de préférence, avec le volume de travail par passage selon le niveau. */
const STATIONS: Array<{ id: string; work: (l: Level) => Omit<Movement, "exerciseId"> }> = [
  { id: "row_erg", work: (l) => ({ distanceM: l === "beginner" ? 250 : 500 }) },
  { id: "wall_ball", work: (l) => ({ reps: l === "advanced" ? 25 : 15 }) },
  { id: "farmer_carry", work: (l) => ({ distanceM: l === "beginner" ? 50 : 100, load: { type: "rpe", rpe: 7 } }) },
  { id: "walking_lunge", work: (l) => ({ reps: l === "beginner" ? 16 : 24 }) },
  { id: "burpee_broad_jump", work: (l) => ({ reps: l === "advanced" ? 12 : 8 }) },
  { id: "kettlebell_swing", work: (l) => ({ reps: l === "beginner" ? 12 : 20, load: { type: "rpe", rpe: 7 } }) },
];

export function availableStations(level: Level, ctx: AvailabilityContext): Exercise[] {
  const rank = { beginner: 0, intermediate: 1, advanced: 2 } as const;
  return STATIONS.map((s) => getExercise(s.id)).filter((e) => isFeasible(e, ctx) && rank[e.level] <= rank[level]);
}

const RUN_SEGMENT_M: Record<Level, number> = { beginner: 400, intermediate: 800, advanced: 1000 };

export const hybridGenerator: SessionGenerator = {
  disciplineId: "hybrid_hyrox",
  variants: TITLE,

  planSlots(count: number, ctx: WeekContext): SlotSpec[] {
    const run = isFeasible(getExercise("compromised_run"), ctx.availability);
    return Array.from({ length: count }, (_, index) => {
      let variant = ROTATION[(index + ctx.weekIndex) % ROTATION.length]!;
      if (!run) variant = "stations";
      const high = variant !== "stations";
      const natural = ctx.discipline.level === "beginner" ? "moderate" : high ? "high" : "moderate";
      const intensity = capIntensity(natural, ctx.intensityCap);
      return {
        disciplineId: "hybrid_hyrox",
        variant,
        index,
        intensity,
        load: { lowerBody: 2, upperBody: variant === "stations" ? 2 : 1, cardio: 3, impact: high ? 2 : 1, cns: cnsAfterCap(ctx.discipline.level === "beginner" ? 1 : 2, natural, intensity) },
        minMinutes: 35,
        preferredMinutes: 60,
        canBeAddOn: false,
      };
    });
  },

  generate(req: GenerateRequest): SessionPlan {
    const variant = req.slot.variant as Variant;
    const { level } = req.discipline;
    const ctx = req.availability;
    const notes = ["Discipline en bêta : volumes et enchaînements en cours de validation."];
    const warmup = warmupBlock(ctx);
    const cooldown = cooldownBlock(ctx, "lower");
    const workMin = Math.max(15, Math.round((req.durationMin - estimateMinutes(compact([warmup, cooldown]))) * req.volumeFactor));
    const stations = availableStations(level, ctx);
    const station = (e: Exercise): Movement => ({ exerciseId: e.id, ...STATIONS.find((s) => s.id === e.id)!.work(level) });

    let main: Block[];
    if (variant === "run_engine") {
      const workDistanceM = RUN_SEGMENT_M[level];
      const perRep = (workDistanceM / 1000) * 330 + 90;
      main = [{ kind: "intervals", exerciseId: "compromised_run", repeats: Math.max(3, Math.min(8, Math.floor((workMin * 60) / perRep))), workDistanceM, restSec: 90, restMode: "walk", intensity: "high", targetRpe: 8 }];
    } else if (variant === "compromised") {
      if (!stations.length) throw new Error("Aucun atelier réalisable pour une séance hybride.");
      // Une course + un atelier par tour, en faisant tourner les ateliers.
      const pick = stations.slice(0, Math.min(stations.length, 4));
      const blocks: Block[] = [];
      let used = 0;
      for (let i = 0; used < workMin * 60 && i < 8; i++) {
        const st = pick[(i + req.slot.index) % pick.length]!;
        const b: Block = {
          kind: "circuit",
          label: `Tour ${i + 1}`,
          rounds: 1,
          movements: [{ exerciseId: "compromised_run", distanceM: RUN_SEGMENT_M[level] }, station(st)],
          restBetweenMovementsSec: 0,
          restBetweenRoundsSec: 0,
          targetRpe: 8,
        };
        const dur = estimateMinutes([b]) * 60 + 60;
        if (used + dur > workMin * 60 && blocks.length >= 2) break;
        blocks.push(b, { kind: "rest", durationSec: 60 });
        used += dur;
      }
      main = blocks.slice(0, -1);
    } else {
      if (stations.length < 2) throw new Error("Pas assez d'ateliers réalisables pour une séance hybride.");
      const movements = stations.slice(0, 4).map(station);
      const perRound = estimateMinutes([{ kind: "circuit", rounds: 1, movements, restBetweenMovementsSec: 30, restBetweenRoundsSec: 0 }]);
      main = [{ kind: "circuit", rounds: Math.max(2, Math.floor(workMin / (perRound + 2))), movements, restBetweenMovementsSec: 30, restBetweenRoundsSec: 120, targetRpe: 7 }];
    }
    if (stations.length < 3) notes.push("Peu d'ateliers réalisables avec votre matériel (rameur, médecine-ball, kettlebells…).");

    const blocks = compact([warmup, ...main, cooldown]);
    return {
      id: req.sessionId,
      disciplineId: "hybrid_hyrox",
      title: `Hybride — ${TITLE[variant]}`,
      focus: variant,
      intensity: req.slot.intensity,
      estimatedMinutes: estimateMinutes(blocks),
      load: req.slot.load,
      blocks,
      notes,
    };
  },
};
