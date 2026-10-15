import { z } from "zod";
import { getDiscipline, hasDiscipline } from "../domain/disciplines.js";

/**
 * Métriques typées par modèle de discipline. Règle transversale : un champ non mesuré
 * est ABSENT (`undefined` ici, `NULL` en base) — jamais estimé, jamais mis à zéro.
 */

const posInt = z.number().int().positive();
const nonNeg = z.number().nonnegative();
const rpe = z.number().min(1).max(10);

/** Provenance d'une mesure : utile pour la confiance et la déduplication des imports. */
export const MeasurementSourceSchema = z.enum(["manual", "live", "gps", "device", "import"]);
export type MeasurementSource = z.infer<typeof MeasurementSourceSchema>;

// ——— Musculation ———
export const ResistanceSetSchema = z.object({
  reps: posInt,
  /** Charge réellement utilisée ; absente si non saisie (poids du corps, oubli…). */
  loadKg: nonNeg.optional(),
  rpe: rpe.optional(),
});
export const ResistanceMetricsSchema = z.object({
  model: z.literal("resistance"),
  exercises: z.array(z.object({ exerciseId: z.string(), sets: z.array(ResistanceSetSchema).min(1) })).min(1),
});
export type ResistanceMetrics = z.infer<typeof ResistanceMetricsSchema>;

// ——— Endurance : course, vélo, natation, rameur, marche, randonnée ———
export const SplitSchema = z.object({
  index: posInt,
  distanceM: z.number().positive(),
  durationSec: z.number().positive(),
  elevationGainM: nonNeg.optional(),
  elevationLossM: nonNeg.optional(),
});
export type Split = z.infer<typeof SplitSchema>;

export const EnduranceMetricsSchema = z
  .object({
    model: z.literal("endurance"),
    /** Durée totale écoulée. */
    durationSec: posInt,
    /** Temps en mouvement (pauses exclues), si l'appareil le distingue. */
    movingTimeSec: posInt.optional(),
    distanceM: posInt.optional(),
    elevationGainM: nonNeg.optional(),
    elevationLossM: nonNeg.optional(),
    avgSpeedKmh: z.number().positive().optional(),
    maxSpeedKmh: z.number().positive().optional(),
    avgHeartRate: z.number().int().min(30).max(240).optional(),
    maxHeartRate: z.number().int().min(30).max(240).optional(),
    splits: z.array(SplitSchema).optional(),
    source: MeasurementSourceSchema.default("manual"),
  })
  .refine((m) => !m.movingTimeSec || m.movingTimeSec <= m.durationSec, "le temps en mouvement ne peut dépasser la durée totale")
  .refine((m) => !m.maxSpeedKmh || !m.avgSpeedKmh || m.maxSpeedKmh >= m.avgSpeedKmh, "vitesse max < vitesse moyenne")
  .refine((m) => !m.splits || m.distanceM !== undefined, "des splits sans distance totale sont incohérents")
  .refine(
    (m) => !m.splits || !m.distanceM || m.splits.reduce((s, x) => s + x.distanceM, 0) <= m.distanceM * 1.01,
    "la somme des splits dépasse la distance totale",
  );
export type EnduranceMetrics = z.infer<typeof EnduranceMetricsSchema>;

// ——— Street workout ———
export const SkillSetSchema = z
  .object({
    reps: posInt.optional(),
    holdSec: posInt.optional(),
    /** Temps sous tension mesuré (chronomètre en séance live). */
    timeUnderTensionSec: posInt.optional(),
  })
  .refine((s) => (s.reps === undefined) !== (s.holdSec === undefined), "reps ou holdSec");
export const SkillMetricsSchema = z.object({
  model: z.literal("skill"),
  exercises: z.array(z.object({ exerciseId: z.string(), variation: z.string().optional(), sets: z.array(SkillSetSchema).min(1) })).min(1),
  /** Figures validées pendant la séance (ex : premier muscle-up). */
  skillsAchieved: z.array(z.string()).default([]),
});
export type SkillMetrics = z.infer<typeof SkillMetricsSchema>;

// ——— Yoga, pilates, mobilité ———
export const BODY_ZONES = ["neck", "shoulders", "thoracic_spine", "lower_back", "hips", "hamstrings", "quads", "calves", "ankles", "wrists", "full_body"] as const;
export const BodyZoneSchema = z.enum(BODY_ZONES);
export type BodyZone = z.infer<typeof BodyZoneSchema>;
export const PracticeMetricsSchema = z.object({
  model: z.literal("practice"),
  durationSec: posInt,
  practices: z.array(z.string().min(1)).min(1),
  zones: z.array(BodyZoneSchema).default([]),
});
export type PracticeMetrics = z.infer<typeof PracticeMetricsSchema>;

// ——— Cross-training / HIIT : le résultat dépend du protocole ———
export const WodMovementSchema = z.object({
  exerciseId: z.string(),
  /** Charge utilisée sur ce mouvement, si mesurée. */
  loadKg: nonNeg.optional(),
  /** Volume prescrit par tour (reps ou distance). */
  reps: posInt.optional(),
  distanceM: posInt.optional(),
});
export const WodMetricsSchema = z
  .object({
    model: z.literal("wod"),
    format: z.enum(["for_time", "amrap", "emom", "intervals", "circuit"]),
    /** Nom du WOD de référence, pour comparer uniquement des protocoles identiques. */
    benchmark: z.string().optional(),
    /** Version adaptée (charges/mouvements allégés) : jamais comparée à la version prescrite. */
    scaled: z.boolean().default(false),
    movements: z.array(WodMovementSchema).min(1),
    durationSec: posInt,
    result: z.discriminatedUnion("type", [
      z.object({ type: z.literal("time"), seconds: posInt }),
      z.object({ type: z.literal("rounds_reps"), rounds: z.number().int().nonnegative(), reps: z.number().int().nonnegative() }),
      /** EMOM / intervalles : nombre de minutes ou intervalles réussis sur le total. */
      z.object({ type: z.literal("intervals_completed"), completed: z.number().int().nonnegative(), total: posInt }),
      z.object({ type: z.literal("completed") }),
    ]),
  })
  .refine((m) => (m.format === "for_time" ? m.result.type === "time" : true), "un WOD « for time » se mesure en temps")
  .refine((m) => (m.format === "amrap" ? m.result.type === "rounds_reps" : true), "un AMRAP se mesure en tours + répétitions")
  .refine((m) => (m.result.type === "intervals_completed" ? m.result.completed <= m.result.total : true), "intervalles réussis > total");
export type WodMetrics = z.infer<typeof WodMetricsSchema>;

export const SessionMetricsSchema = z.discriminatedUnion("model", [
  ResistanceMetricsSchema,
  EnduranceMetricsSchema,
  SkillMetricsSchema,
  PracticeMetricsSchema,
  WodMetricsSchema,
]);
export type SessionMetrics = z.infer<typeof SessionMetricsSchema>;

export const INTEGRATION_PROVIDERS = ["apple_health", "health_connect", "strava", "garmin"] as const;
export const IntegrationProviderSchema = z.enum(INTEGRATION_PROVIDERS);
export type IntegrationProvider = z.infer<typeof IntegrationProviderSchema>;

export const SessionResultSchema = z
  .object({
    id: z.string().min(1),
    userId: z.string().min(1),
    disciplineId: z.string().refine(hasDiscipline, "discipline inconnue"),
    /** Séance planifiée correspondante, si la séance n'était pas libre. */
    plannedSessionId: z.string().optional(),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    /** Horodatage de début (ISO 8601), nécessaire au rapprochement avec les imports. */
    startedAt: z.string().datetime({ offset: true }).optional(),
    status: z.enum(["completed", "partial", "skipped"]),
    durationSec: posInt.optional(),
    perceivedEffort: z.number().int().min(1).max(10).optional(),
    /** Douleur signalée : déclenche l'adaptation de la suite, jamais une pénalité. */
    painReported: z.boolean().default(false),
    metrics: SessionMetricsSchema.optional(),
    notes: z.string().optional(),
    /** Activité importée ou synchronisée avec un service tiers. */
    external: z.object({ provider: IntegrationProviderSchema, id: z.string().min(1) }).optional(),
  })
  .superRefine((r, ctx) => {
    if (r.metrics && hasDiscipline(r.disciplineId) && getDiscipline(r.disciplineId).metricModel !== r.metrics.model) {
      ctx.addIssue({ code: "custom", path: ["metrics", "model"], message: `modèle de métriques « ${r.metrics.model} » incompatible avec ${r.disciplineId}` });
    }
    if (r.status === "skipped" && r.metrics) ctx.addIssue({ code: "custom", path: ["metrics"], message: "une séance non réalisée n'a pas de métriques" });
  });
export type SessionResult = z.infer<typeof SessionResultSchema>;
export type SessionResultInput = z.input<typeof SessionResultSchema>;

// ——— Valeurs dérivées : calculées seulement à partir de données mesurées ———

export interface Tonnage {
  /** Somme charge × répétitions des séries dont la charge est connue. */
  totalKg: number;
  setsCounted: number;
  setsWithoutLoad: number;
  /** Vrai si toutes les séries ont une charge : le tonnage est alors celui de la séance entière. */
  complete: boolean;
}

/** Tonnage automatique. Les séries sans charge sont comptées à part, jamais estimées. */
export function tonnage(m: ResistanceMetrics): Tonnage {
  let totalKg = 0;
  let setsCounted = 0;
  let setsWithoutLoad = 0;
  for (const ex of m.exercises) {
    for (const s of ex.sets) {
      if (s.loadKg === undefined) setsWithoutLoad++;
      else {
        totalKg += s.loadKg * s.reps;
        setsCounted++;
      }
    }
  }
  return { totalKg, setsCounted, setsWithoutLoad, complete: setsWithoutLoad === 0 };
}

/** Volume (tonnage) de la séance entière, `undefined` si une seule charge manque. */
export function resistanceVolumeKg(m: ResistanceMetrics): number | undefined {
  const t = tonnage(m);
  return t.complete ? t.totalKg : undefined;
}

/** Allure en secondes par km (temps en mouvement si connu). `undefined` sans distance mesurée. */
export function paceSecPerKm(m: EnduranceMetrics): number | undefined {
  return m.distanceM ? Math.round((m.movingTimeSec ?? m.durationSec) / (m.distanceM / 1000)) : undefined;
}

/** Vitesse moyenne : la valeur mesurée prime, sinon dérivée de distance et durée. */
export function speedKmh(m: EnduranceMetrics): number | undefined {
  if (m.avgSpeedKmh !== undefined) return m.avgSpeedKmh;
  const t = m.movingTimeSec ?? m.durationSec;
  return m.distanceM ? Math.round((m.distanceM / 1000 / (t / 3600)) * 10) / 10 : undefined;
}

export const splitPaceSecPerKm = (s: Split): number => Math.round(s.durationSec / (s.distanceM / 1000));
