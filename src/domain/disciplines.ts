import type { AssetKind, BlockKind, CoverageLevel, Environment, Goal, MetricModel } from "./enums.js";

export type SportFamily =
  | "strength"
  | "conditioning"
  | "endurance"
  | "bodyweight"
  | "mind_body"
  | "combat"
  | "team"
  | "other";

export interface DisciplineDefinition {
  id: string;
  name: string;
  family: SportFamily;
  coverage: CoverageLevel;
  /** Forme des métriques enregistrées pour une séance de cette discipline. */
  metricModel: MetricModel;
  /** Formats de blocs autorisés dans une séance de cette discipline. */
  allowedBlocks: readonly BlockKind[];
  typicalEnvironments: readonly Environment[];
  /** Objectifs pour lesquels la discipline est un levier pertinent. */
  supportsGoals: readonly Goal[];
  /** Types de visuels à privilégier pour les fiches de cette discipline. */
  preferredAssets: readonly AssetKind[];
}

const STRUCTURE: readonly BlockKind[] = ["warmup", "cooldown", "mobility", "rest", "technique"];

const d = (def: DisciplineDefinition): DisciplineDefinition => def;

/**
 * Catalogue initial. La couverture est déclarée honnêtement :
 * seules les 5 disciplines de la V1 sont `full` ; l'hybride est en `beta`.
 */
const BUILTIN: DisciplineDefinition[] = [
  // ——— V1 opérationnelle ———
  d({
    id: "strength_training",
    name: "Musculation",
    family: "strength",
    coverage: "full",
    metricModel: "resistance",
    allowedBlocks: [...STRUCTURE, "sets_reps", "loaded_sets", "timed"],
    typicalEnvironments: ["gym", "home_equipped"],
    supportsGoals: ["muscle_gain", "weight_gain", "fat_loss", "max_strength", "general_fitness", "health"],
    preferredAssets: ["animation_3d", "video", "image"],
  }),
  d({
    id: "calisthenics",
    name: "Street workout & calisthenics",
    family: "bodyweight",
    coverage: "full",
    metricModel: "skill",
    allowedBlocks: [...STRUCTURE, "sets_reps", "timed", "circuit", "emom"],
    typicalEnvironments: ["street_workout_park", "home_no_equipment", "home_equipped", "outdoor"],
    supportsGoals: ["muscle_gain", "max_strength", "power", "general_fitness", "health"],
    preferredAssets: ["animation_3d", "video", "technique_breakdown"],
  }),
  d({
    id: "running",
    name: "Course à pied",
    family: "endurance",
    coverage: "full",
    metricModel: "endurance",
    allowedBlocks: [...STRUCTURE, "distance", "intervals", "timed", "outdoor"],
    typicalEnvironments: ["outdoor", "track"],
    supportsGoals: ["cardio_endurance", "speed", "fat_loss", "event_prep", "general_fitness", "health"],
    preferredAssets: ["route_map", "technique_breakdown", "diagram", "video"],
  }),
  d({
    id: "hiit",
    name: "HIIT & circuits fonctionnels",
    family: "conditioning",
    coverage: "full",
    metricModel: "wod",
    allowedBlocks: [...STRUCTURE, "intervals", "circuit", "emom", "amrap", "timed"],
    typicalEnvironments: ["gym", "home_no_equipment", "home_equipped", "outdoor"],
    supportsGoals: ["fat_loss", "cardio_endurance", "power", "agility", "general_fitness"],
    preferredAssets: ["video", "animation_3d", "image"],
  }),
  d({
    id: "mobility",
    name: "Mobilité & souplesse",
    family: "mind_body",
    coverage: "full",
    metricModel: "practice",
    allowedBlocks: ["warmup", "mobility", "cooldown", "timed", "rest", "technique"],
    typicalEnvironments: ["home_no_equipment", "home_equipped", "gym", "outdoor"],
    supportsGoals: ["mobility", "flexibility", "health", "general_fitness"],
    preferredAssets: ["video", "animation_3d", "image"],
  }),

  // ——— tracking_only : suivi manuel avec métriques typées, pas de génération ———
  d({
    id: "hypertrophy",
    name: "Hypertrophie",
    family: "strength",
    coverage: "tracking_only",
    metricModel: "resistance",
    allowedBlocks: [...STRUCTURE, "sets_reps", "loaded_sets", "timed"],
    typicalEnvironments: ["gym", "home_equipped"],
    supportsGoals: ["muscle_gain", "weight_gain"],
    preferredAssets: ["animation_3d", "video"],
  }),
  d({
    id: "powerlifting",
    name: "Force & powerlifting",
    family: "strength",
    coverage: "tracking_only",
    metricModel: "resistance",
    allowedBlocks: [...STRUCTURE, "loaded_sets", "sets_reps"],
    typicalEnvironments: ["gym"],
    supportsGoals: ["max_strength", "event_prep"],
    preferredAssets: ["animation_3d", "video", "technique_breakdown"],
  }),
  d({
    id: "weightlifting",
    name: "Haltérophilie",
    family: "strength",
    coverage: "tracking_only",
    metricModel: "resistance",
    allowedBlocks: [...STRUCTURE, "loaded_sets", "emom"],
    typicalEnvironments: ["gym"],
    supportsGoals: ["power", "max_strength", "event_prep"],
    preferredAssets: ["technique_breakdown", "video", "animation_3d"],
  }),
  d({
    id: "crossfit",
    name: "CrossFit & entraînement fonctionnel",
    family: "conditioning",
    coverage: "tracking_only",
    metricModel: "wod",
    allowedBlocks: [...STRUCTURE, "loaded_sets", "sets_reps", "circuit", "emom", "amrap", "intervals", "timed"],
    typicalEnvironments: ["gym"],
    supportsGoals: ["general_fitness", "power", "cardio_endurance", "fat_loss"],
    preferredAssets: ["video", "animation_3d"],
  }),
  d({
    id: "walking",
    name: "Marche active",
    family: "endurance",
    coverage: "tracking_only",
    metricModel: "endurance",
    allowedBlocks: ["warmup", "cooldown", "distance", "timed", "outdoor"],
    typicalEnvironments: ["outdoor"],
    supportsGoals: ["health", "fat_loss", "cardio_endurance"],
    preferredAssets: ["route_map"],
  }),
  d({
    id: "cycling",
    name: "Vélo & cyclisme d'intérieur",
    family: "endurance",
    coverage: "tracking_only",
    metricModel: "endurance",
    allowedBlocks: [...STRUCTURE, "distance", "intervals", "timed", "outdoor"],
    typicalEnvironments: ["bike", "outdoor", "gym"],
    supportsGoals: ["cardio_endurance", "fat_loss", "event_prep", "health"],
    preferredAssets: ["route_map", "diagram"],
  }),
  d({
    id: "swimming",
    name: "Natation",
    family: "endurance",
    coverage: "tracking_only",
    metricModel: "endurance",
    allowedBlocks: [...STRUCTURE, "distance", "intervals", "timed"],
    typicalEnvironments: ["pool", "outdoor"],
    supportsGoals: ["cardio_endurance", "health", "general_fitness"],
    preferredAssets: ["technique_breakdown", "diagram", "video"],
  }),
  d({
    id: "rowing",
    name: "Rameur",
    family: "endurance",
    coverage: "tracking_only",
    metricModel: "endurance",
    allowedBlocks: [...STRUCTURE, "distance", "intervals", "timed"],
    typicalEnvironments: ["gym", "home_equipped"],
    supportsGoals: ["cardio_endurance", "fat_loss", "general_fitness"],
    preferredAssets: ["technique_breakdown", "video"],
  }),
  d({
    id: "jump_rope",
    name: "Corde à sauter",
    family: "conditioning",
    coverage: "tracking_only",
    metricModel: "wod",
    allowedBlocks: [...STRUCTURE, "intervals", "timed", "emom"],
    typicalEnvironments: ["home_no_equipment", "outdoor", "gym"],
    supportsGoals: ["cardio_endurance", "agility", "fat_loss"],
    preferredAssets: ["video"],
  }),
  d({
    id: "yoga",
    name: "Yoga",
    family: "mind_body",
    coverage: "tracking_only",
    metricModel: "practice",
    allowedBlocks: ["warmup", "mobility", "cooldown", "timed", "technique", "rest"],
    typicalEnvironments: ["home_no_equipment", "gym", "outdoor"],
    supportsGoals: ["flexibility", "mobility", "health"],
    preferredAssets: ["video", "image"],
  }),
  d({
    id: "pilates",
    name: "Pilates",
    family: "mind_body",
    coverage: "tracking_only",
    metricModel: "practice",
    allowedBlocks: ["warmup", "mobility", "cooldown", "timed", "sets_reps", "technique", "rest"],
    typicalEnvironments: ["home_no_equipment", "gym"],
    supportsGoals: ["mobility", "health", "general_fitness"],
    preferredAssets: ["video", "animation_3d"],
  }),
  d({
    id: "hiking",
    name: "Randonnée & endurance extérieure",
    family: "endurance",
    coverage: "tracking_only",
    metricModel: "endurance",
    allowedBlocks: ["warmup", "cooldown", "outdoor", "distance", "rest"],
    typicalEnvironments: ["outdoor"],
    supportsGoals: ["cardio_endurance", "health", "event_prep"],
    preferredAssets: ["route_map"],
  }),

  // ——— alpha : référencées, séance libre uniquement (hybride : beta, générateur en validation) ———
  d({
    id: "sprint",
    name: "Sprint & athlétisme",
    family: "endurance",
    coverage: "alpha",
    metricModel: "endurance",
    allowedBlocks: [...STRUCTURE, "intervals", "distance"],
    typicalEnvironments: ["track", "sports_field"],
    supportsGoals: ["speed", "power", "event_prep"],
    preferredAssets: ["technique_breakdown", "video"],
  }),
  d({
    id: "gpp",
    name: "Préparation physique générale",
    family: "conditioning",
    coverage: "alpha",
    metricModel: "wod",
    allowedBlocks: [...STRUCTURE, "sets_reps", "loaded_sets", "circuit", "intervals", "timed"],
    typicalEnvironments: ["gym", "sports_field", "outdoor"],
    supportsGoals: ["general_fitness", "power", "agility"],
    preferredAssets: ["video"],
  }),
  d({
    id: "combat_conditioning",
    name: "Sports de combat & conditionnement",
    family: "combat",
    coverage: "alpha",
    metricModel: "wod",
    allowedBlocks: [...STRUCTURE, "intervals", "circuit", "timed"],
    typicalEnvironments: ["gym", "home_no_equipment"],
    supportsGoals: ["cardio_endurance", "power", "agility"],
    preferredAssets: ["video"],
  }),
  d({
    id: "hybrid_hyrox",
    name: "Entraînement hybride (type HYROX)",
    family: "conditioning",
    coverage: "beta",
    metricModel: "wod",
    allowedBlocks: [...STRUCTURE, "distance", "intervals", "circuit", "loaded_sets", "timed"],
    typicalEnvironments: ["gym", "outdoor"],
    supportsGoals: ["cardio_endurance", "event_prep", "general_fitness"],
    preferredAssets: ["video", "diagram"],
  }),
  d({
    id: "team_sport_prep",
    name: "Préparation physique sports collectifs",
    family: "team",
    coverage: "alpha",
    metricModel: "wod",
    allowedBlocks: [...STRUCTURE, "intervals", "circuit", "sets_reps", "loaded_sets", "distance"],
    typicalEnvironments: ["sports_field", "gym"],
    supportsGoals: ["speed", "agility", "power", "event_prep"],
    preferredAssets: ["diagram", "video"],
  }),
];

const registry = new Map<string, DisciplineDefinition>(BUILTIN.map((x) => [x.id, x]));

/** Point d'extension : ajouter une discipline sans toucher au reste de l'application. */
export function registerDiscipline(def: DisciplineDefinition): void {
  if (!/^[a-z][a-z0-9_]*$/.test(def.id)) throw new Error(`Identifiant de discipline invalide : ${def.id}`);
  if (registry.has(def.id)) throw new Error(`Discipline déjà enregistrée : ${def.id}`);
  if (def.allowedBlocks.length === 0) throw new Error(`La discipline ${def.id} doit autoriser au moins un type de bloc`);
  registry.set(def.id, def);
}

export function getDiscipline(id: string): DisciplineDefinition {
  const def = registry.get(id);
  if (!def) throw new Error(`Discipline inconnue : ${id}`);
  return def;
}

export function hasDiscipline(id: string): boolean {
  return registry.has(id);
}

export function listDisciplines(filter?: { coverage?: CoverageLevel }): DisciplineDefinition[] {
  const all = [...registry.values()];
  return filter?.coverage ? all.filter((x) => x.coverage === filter.coverage) : all;
}

export const V1_DISCIPLINES = ["strength_training", "calisthenics", "running", "hiit", "mobility"] as const;
export type V1Discipline = (typeof V1_DISCIPLINES)[number];
