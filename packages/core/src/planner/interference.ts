import type { TrainingLoad } from "../blocks/schema.js";
import { WEEKDAYS, type Intensity, type Level, type Weekday } from "../domain/enums.js";
import { intensityRank } from "../generators/types.js";

/** Ce que les règles savent d'une séance : sa nature, pas son contenu détaillé. */
export interface SessionTraits {
  disciplineId: string;
  variant: string;
  intensity: Intensity;
  load: TrainingLoad;
}

export type InterferenceRuleId = "heavy_legs_then_vma" | "vma_then_heavy_legs" | "high_then_high" | "lower_body_overlap" | "upper_body_overlap";

/**
 * Règle d'interférence entre deux séances ordonnées (`first` puis `second`).
 * Le calendrier est au jour près : deux séances le même jour sont à 0 h, à J+1 à 24 h, etc.
 * Faute d'heure précise, une séance le lendemain est considérée comme pouvant tomber
 * sous les 24 h : les règles « 24 h » sont donc appliquées avec une marge (minGapHours = 48).
 */
export interface InterferenceRule {
  id: InterferenceRuleId;
  severity: "warning" | "error";
  minGapHours: number;
  first: (s: SessionTraits) => boolean;
  second: (s: SessionTraits) => boolean;
  /** Une règle symétrique n'est évaluée qu'une fois par paire. */
  symmetric: boolean;
  /** Coût utilisé par l'orchestrateur pour éviter ce placement. */
  placementPenalty: number;
  describe: (first: SessionTraits, second: SessionTraits) => string;
}

const atLeast = (i: Intensity, min: Intensity) => intensityRank(i) >= intensityRank(min);

/** Séance lourde jambes : bas du corps très sollicité, ou sollicité ET coûteux nerveusement. */
export const isHeavyLegs = (s: SessionTraits): boolean =>
  atLeast(s.intensity, "moderate") && (s.load.lowerBody >= 3 || (s.load.lowerBody >= 2 && s.load.cns >= 2 && s.load.cardio < 3));

/** Travail type VMA / fractionné : cardio maximal, coût nerveux, jambes sollicitées. */
export const isVmaLike = (s: SessionTraits): boolean => s.intensity === "high" && s.load.cardio >= 3 && s.load.cns >= 2 && s.load.lowerBody >= 2;

const heavyRegion = (r: "lowerBody" | "upperBody") => (s: SessionTraits) => s.load[r] >= 2 && atLeast(s.intensity, "moderate");

export const INTERFERENCE_RULES: readonly InterferenceRule[] = [
  {
    id: "heavy_legs_then_vma",
    severity: "error",
    minGapHours: 48,
    first: isHeavyLegs,
    second: isVmaLike,
    symmetric: false,
    placementPenalty: 30,
    describe: () => "Fractionné / VMA moins de 24 h après une séance lourde jambes : qualité dégradée et risque de blessure.",
  },
  {
    id: "vma_then_heavy_legs",
    severity: "warning",
    minGapHours: 48,
    first: isVmaLike,
    second: isHeavyLegs,
    symmetric: false,
    placementPenalty: 10,
    describe: () => "Séance lourde jambes le lendemain d'un fractionné : récupération musculaire incomplète.",
  },
  {
    id: "high_then_high",
    severity: "warning",
    minGapHours: 48,
    first: (s) => s.intensity === "high",
    second: (s) => s.intensity === "high",
    symmetric: true,
    placementPenalty: 10,
    describe: () => "Deux séances intenses consécutives : récupération limitée.",
  },
  {
    id: "lower_body_overlap",
    severity: "warning",
    minGapHours: 48,
    first: heavyRegion("lowerBody"),
    second: heavyRegion("lowerBody"),
    symmetric: true,
    placementPenalty: 6,
    describe: () => "Jambes fortement sollicitées deux jours de suite.",
  },
  {
    id: "upper_body_overlap",
    severity: "warning",
    minGapHours: 48,
    first: heavyRegion("upperBody"),
    second: heavyRegion("upperBody"),
    symmetric: true,
    placementPenalty: 6,
    describe: () => "Haut du corps fortement sollicité deux jours de suite.",
  },
];

/** Écart en heures de `from` vers `to`, semaine cyclique (dimanche → lundi = 24 h). */
export const gapHours = (from: Weekday, to: Weekday): number => (((WEEKDAYS.indexOf(to) - WEEKDAYS.indexOf(from)) % 7) + 7) % 7 * 24;

export interface PlacedTraits {
  day: Weekday;
  traits: SessionTraits;
  id?: string;
}

export interface Violation {
  rule: InterferenceRule;
  first: PlacedTraits;
  second: PlacedTraits;
  gapHours: number;
}

/** Évalue une paire de séances dans les deux sens. */
export function violationsBetween(a: PlacedTraits, b: PlacedTraits): Violation[] {
  const out: Violation[] = [];
  for (const rule of INTERFERENCE_RULES) {
    for (const [first, second] of [[a, b], [b, a]] as const) {
      const gap = gapHours(first.day, second.day);
      if (gap < rule.minGapHours && rule.first(first.traits) && rule.second(second.traits)) {
        out.push({ rule, first, second, gapHours: gap });
        break; // une seule fois par paire et par règle
      }
    }
  }
  return out;
}

/** Budget hebdomadaire de stress nerveux (somme des scores SNC des séances). */
export const WEEKLY_CNS_BUDGET: Record<Level, number> = { beginner: 5, intermediate: 8, advanced: 11 };
