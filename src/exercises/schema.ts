import { z } from "zod";
import {
  AssetHostingSchema,
  AssetKindSchema,
  BodyRegionSchema,
  EnvironmentSchema,
  EquipmentSchema,
  GoalSchema,
  LevelSchema,
  MovementPatternSchema,
  MuscleGroupSchema,
} from "../domain/enums.js";

export const ExerciseAssetSchema = z
  .object({
    kind: AssetKindSchema,
    uri: z.string().min(1),
    /** Licence obligatoire : aucun asset sans provenance traçable. */
    license: z.string().min(1),
    source: z.string().min(1),
    author: z.string().optional(),
    /** `bundled` : livré avec l'app (toujours hors-ligne) ; `remote` : téléchargé puis mis en cache. */
    hosting: AssetHostingSchema.default("remote"),
    sizeBytes: z.number().int().positive().optional(),
    /** Empreinte du fichier, pour invalider le cache local quand l'asset change. */
    sha256: z.string().regex(/^[a-f0-9]{64}$/).optional(),
    /** Précharger pour les séances hors-ligne (sinon chargé à la demande). */
    offline: z.boolean().default(true),
  })
  .refine((a) => a.hosting === "bundled" || a.sizeBytes !== undefined, "un asset distant doit déclarer sa taille (budget de cache)");
export type ExerciseAsset = z.infer<typeof ExerciseAssetSchema>;

/** Mesures de progression pertinentes pour l'exercice (ce qui a du sens d'enregistrer). */
export const ProgressionMeasureSchema = z.enum([
  "load_kg",
  "reps",
  "sets",
  "hold_sec",
  "duration_sec",
  "distance_m",
  "pace",
  "rounds",
  "range_of_motion",
  "variation",
]);
export type ProgressionMeasure = z.infer<typeof ProgressionMeasureSchema>;

export const ExerciseSchema = z
  .object({
    id: z.string().regex(/^[a-z][a-z0-9_]*$/),
    name: z.string().min(1),
    disciplines: z.array(z.string()).min(1),
    categories: z.array(z.string()).default([]),
    goals: z.array(GoalSchema).default([]),
    level: LevelSchema,
    pattern: MovementPatternSchema,
    /**
     * Ensembles d'équipements acceptés : l'exercice est faisable si UN des ensembles
     * est entièrement disponible. `[[]]` = aucun matériel.
     */
    equipmentOptions: z.array(z.array(EquipmentSchema)).min(1),
    environments: z.array(EnvironmentSchema).min(1),
    muscles: z.array(MuscleGroupSchema).default([]),
    instructions: z.array(z.string().min(1)).min(1),
    prerequisites: z.array(z.string()).default([]),
    /** Variantes plus faciles / plus difficiles (ids d'exercices). */
    easier: z.array(z.string()).default([]),
    harder: z.array(z.string()).default([]),
    /** Alternatives de même intention, utilisables si le matériel manque. */
    alternatives: z.array(z.string()).default([]),
    precautions: z.array(z.string()).default([]),
    /** Zones sollicitées de manière notable : exclues si l'utilisateur signale une gêne. */
    stressedRegions: z.array(BodyRegionSchema).default([]),
    highImpact: z.boolean().default(false),
    progressionMeasures: z.array(ProgressionMeasureSchema).min(1),
    assets: z.array(ExerciseAssetSchema).default([]),
    /** Statut éditorial : aucun contenu n'est présenté comme validé par un expert s'il ne l'est pas. */
    review: z
      .object({
        status: z.enum(["draft", "internal_review", "expert_validated"]),
        reviewer: z.string().optional(),
      })
      .default({ status: "draft" }),
  })
  .superRefine((ex, ctx) => {
    for (const ref of [...ex.easier, ...ex.harder, ...ex.alternatives]) {
      if (ref === ex.id) ctx.addIssue({ code: "custom", message: `${ex.id} se référence lui-même` });
    }
  });

export type Exercise = z.infer<typeof ExerciseSchema>;
export type ExerciseInput = z.input<typeof ExerciseSchema>;
