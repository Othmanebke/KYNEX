import { z } from "zod";

/**
 * Référentiels fermés du domaine. Les disciplines sont volontairement une liste
 * ouverte (voir `disciplines.ts` / `registerDiscipline`) : seuls les identifiants
 * de base sont déclarés ici.
 */

export const LEVELS = ["beginner", "intermediate", "advanced"] as const;
export const LevelSchema = z.enum(LEVELS);
export type Level = z.infer<typeof LevelSchema>;

export const GOALS = [
  "muscle_gain",
  "weight_gain",
  "fat_loss",
  "max_strength",
  "cardio_endurance",
  "speed",
  "power",
  "agility",
  "mobility",
  "flexibility",
  "general_fitness",
  "event_prep",
  "health",
] as const;
export const GoalSchema = z.enum(GOALS);
export type Goal = z.infer<typeof GoalSchema>;

export const ENVIRONMENTS = [
  "gym",
  "home_no_equipment",
  "home_equipped",
  "street_workout_park",
  "outdoor",
  "track",
  "pool",
  "sports_field",
  "bike",
] as const;
export const EnvironmentSchema = z.enum(ENVIRONMENTS);
export type Environment = z.infer<typeof EnvironmentSchema>;

/**
 * Équipements de base. `bodyweight` est implicite : il est toujours disponible.
 * Des équipements supplémentaires peuvent être déclarés via le préfixe `custom:`.
 */
export const BASE_EQUIPMENT = [
  "bodyweight",
  "dumbbells",
  "barbell",
  "machines",
  "cables",
  "bench",
  "kettlebell",
  "resistance_band",
  "pullup_bar",
  "parallel_bars",
  "jump_rope",
  "mat",
  "bike",
  "rower",
  "squat_rack",
] as const;
export type BaseEquipment = (typeof BASE_EQUIPMENT)[number];
export const EquipmentSchema = z.union([
  z.enum(BASE_EQUIPMENT),
  z.string().regex(/^custom:[a-z0-9_]+$/, "équipement personnalisé : custom:<slug>"),
]);
export type Equipment = z.infer<typeof EquipmentSchema>;

export const BLOCK_KINDS = [
  "sets_reps",
  "loaded_sets",
  "timed",
  "distance",
  "intervals",
  "circuit",
  "emom",
  "amrap",
  "technique",
  "warmup",
  "mobility",
  "cooldown",
  "rest",
  "outdoor",
] as const;
export const BlockKindSchema = z.enum(BLOCK_KINDS);
export type BlockKind = z.infer<typeof BlockKindSchema>;

/** Modèle de suivi : détermine la forme typée des métriques d'une séance. */
export const METRIC_MODELS = ["resistance", "endurance", "skill", "practice", "wod"] as const;
export const MetricModelSchema = z.enum(METRIC_MODELS);
export type MetricModel = z.infer<typeof MetricModelSchema>;

/**
 * Niveau de couverture d'une discipline, affiché honnêtement à l'utilisateur.
 * - `full` : contenus, règles de programmation, générateur, suivi, tests et parcours complets.
 * - `beta` : générateur disponible, règles encore en validation (signalé à l'utilisateur).
 * - `alpha` : discipline référencée ; seule une séance libre peut être consignée.
 * - `tracking_only` : planification/suivi manuel avec métriques typées, sans génération.
 */
export const COVERAGE_LEVELS = ["full", "beta", "alpha", "tracking_only"] as const;
export type CoverageLevel = (typeof COVERAGE_LEVELS)[number];
/** Couvertures pour lesquelles l'orchestrateur peut générer des séances. */
export const GENERATABLE_COVERAGE: readonly CoverageLevel[] = ["full", "beta"];

export const MOVEMENT_PATTERNS = [
  "squat",
  "hinge",
  "lunge",
  "horizontal_push",
  "horizontal_pull",
  "vertical_push",
  "vertical_pull",
  "core",
  "carry",
  "locomotion",
  "jump",
  "full_body",
  "mobility",
  "stretch",
] as const;
export const MovementPatternSchema = z.enum(MOVEMENT_PATTERNS);
export type MovementPattern = z.infer<typeof MovementPatternSchema>;

export const MUSCLE_GROUPS = [
  "chest",
  "back",
  "shoulders",
  "biceps",
  "triceps",
  "forearms",
  "core",
  "glutes",
  "quads",
  "hamstrings",
  "calves",
  "hips",
  "full_body",
] as const;
export const MuscleGroupSchema = z.enum(MUSCLE_GROUPS);
export type MuscleGroup = z.infer<typeof MuscleGroupSchema>;

/** Zones corporelles utilisées pour les contraintes (blessures, gêne). */
export const BODY_REGIONS = ["shoulder", "elbow", "wrist", "lower_back", "hip", "knee", "ankle", "neck"] as const;
export const BodyRegionSchema = z.enum(BODY_REGIONS);
export type BodyRegion = z.infer<typeof BodyRegionSchema>;

export const WEEKDAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
export const WeekdaySchema = z.enum(WEEKDAYS);
export type Weekday = z.infer<typeof WeekdaySchema>;

export const INTENSITIES = ["recovery", "low", "moderate", "high"] as const;
export const IntensitySchema = z.enum(INTENSITIES);
export type Intensity = z.infer<typeof IntensitySchema>;

export const ASSET_KINDS = ["animation_3d", "video", "image", "diagram", "route_map", "technique_breakdown"] as const;
export const AssetKindSchema = z.enum(ASSET_KINDS);
export type AssetKind = z.infer<typeof AssetKindSchema>;

/** Hébergement d'un asset : embarqué dans l'app (disponible hors-ligne) ou distant (mis en cache). */
export const ASSET_HOSTINGS = ["bundled", "remote"] as const;
export const AssetHostingSchema = z.enum(ASSET_HOSTINGS);
