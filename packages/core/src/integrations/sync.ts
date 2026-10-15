import { getDiscipline } from "../domain/disciplines.js";
import type { EnduranceMetrics, IntegrationProvider, SessionResult, SessionResultInput } from "../tracking/metrics.js";
import { SessionResultSchema } from "../tracking/metrics.js";
import { ExternalActivitySchema, type ExportPayload, type ExternalActivity } from "./types.js";

/** Correspondance types d'activité fournisseur → discipline. Inconnu = ignoré (et signalé). */
export const ACTIVITY_TYPE_MAP: Record<IntegrationProvider, Record<string, string>> = {
  strava: {
    Run: "running", TrailRun: "running", VirtualRun: "running", Walk: "walking", Hike: "hiking",
    Ride: "cycling", VirtualRide: "cycling", GravelRide: "cycling", MountainBikeRide: "cycling",
    Swim: "swimming", Rowing: "rowing", VirtualRow: "rowing", WeightTraining: "strength_training",
    HighIntensityIntervalTraining: "hiit", Crossfit: "crossfit", Yoga: "yoga", Pilates: "pilates",
  },
  health_connect: {
    RUNNING: "running", RUNNING_TREADMILL: "running", WALKING: "walking", HIKING: "hiking",
    BIKING: "cycling", BIKING_STATIONARY: "cycling", SWIMMING_POOL: "swimming", SWIMMING_OPEN_WATER: "swimming",
    ROWING_MACHINE: "rowing", STRENGTH_TRAINING: "strength_training", WEIGHTLIFTING: "weightlifting",
    CALISTHENICS: "calisthenics", HIGH_INTENSITY_INTERVAL_TRAINING: "hiit", YOGA: "yoga", PILATES: "pilates",
    STRETCHING: "mobility",
  },
  apple_health: {
    running: "running", walking: "walking", hiking: "hiking", cycling: "cycling", swimming: "swimming",
    rowing: "rowing", traditionalStrengthTraining: "strength_training", functionalStrengthTraining: "crossfit",
    crossTraining: "crossfit", highIntensityIntervalTraining: "hiit", yoga: "yoga", pilates: "pilates",
    flexibility: "mobility", jumpRope: "jump_rope",
  },
  garmin: {
    running: "running", trail_running: "running", treadmill_running: "running", walking: "walking", hiking: "hiking",
    cycling: "cycling", indoor_cycling: "cycling", lap_swimming: "swimming", open_water_swimming: "swimming",
    indoor_rowing: "rowing", strength_training: "strength_training", hiit: "hiit", yoga: "yoga", pilates: "pilates",
  },
};

/** Écart maximal entre deux départs pour considérer qu'il s'agit de la même séance. */
export const SAME_SESSION_WINDOW_MIN = 10;

export interface ImportPlan {
  /** Nouvelles séances à créer (source : service tiers). */
  create: SessionResult[];
  /** Séances de l'app reconnues : on y rattache l'identifiant externe et on complète les mesures absentes. */
  link: Array<{ resultId: string; external: NonNullable<SessionResult["external"]>; filled: Partial<EnduranceMetrics> }>;
  /** Activités ignorées, avec la raison (jamais silencieusement). */
  skipped: Array<{ externalId: string; reason: "already_imported" | "unknown_type" | "invalid" }>;
}

const minutesBetween = (a: string, b: string) => Math.abs(Date.parse(a) - Date.parse(b)) / 60_000;

function endurancePart(a: ExternalActivity): Partial<EnduranceMetrics> {
  const out: Partial<EnduranceMetrics> = {};
  for (const k of ["movingTimeSec", "distanceM", "elevationGainM", "elevationLossM", "avgSpeedKmh", "maxSpeedKmh", "avgHeartRate", "maxHeartRate", "splits"] as const) {
    if (a[k] !== undefined) (out as Record<string, unknown>)[k] = a[k];
  }
  return out;
}

export function externalToSessionResult(a: ExternalActivity, userId: string, disciplineId: string): SessionResult {
  const model = getDiscipline(disciplineId).metricModel;
  const input: SessionResultInput = {
    id: `${a.provider}:${a.externalId}`,
    userId,
    disciplineId,
    date: a.startedAt.slice(0, 10),
    startedAt: a.startedAt,
    status: "completed",
    ...(a.durationSec ? { durationSec: a.durationSec } : {}),
    external: { provider: a.provider, id: a.externalId },
    // Seul le modèle endurance peut être reconstitué depuis un service tiers ; pour les
    // autres (musculation, WOD…), on importe la séance sans inventer de séries.
    ...(model === "endurance" && a.durationSec ? { metrics: { model: "endurance", durationSec: a.durationSec, ...endurancePart(a), source: "import" } } : {}),
  };
  return SessionResultSchema.parse(input);
}

/**
 * Plan d'import idempotent :
 * 1. identifiant externe déjà connu → ignoré ;
 * 2. séance de l'app de même discipline démarrée à ±10 min → rattachement, l'app reste prioritaire
 *    et seules les mesures ABSENTES sont complétées par l'appareil ;
 * 3. sinon → nouvelle séance importée.
 */
export function planImport(existing: SessionResult[], incoming: unknown[], userId: string): ImportPlan {
  const plan: ImportPlan = { create: [], link: [], skipped: [] };
  const known = new Set(existing.filter((r) => r.external).map((r) => `${r.external!.provider}:${r.external!.id}`));
  for (const raw of incoming) {
    const parsed = ExternalActivitySchema.safeParse(raw);
    if (!parsed.success) {
      plan.skipped.push({ externalId: String((raw as { externalId?: unknown })?.externalId ?? "?"), reason: "invalid" });
      continue;
    }
    const a = parsed.data;
    const key = `${a.provider}:${a.externalId}`;
    if (known.has(key)) {
      plan.skipped.push({ externalId: a.externalId, reason: "already_imported" });
      continue;
    }
    const disciplineId = ACTIVITY_TYPE_MAP[a.provider][a.type];
    if (!disciplineId) {
      plan.skipped.push({ externalId: a.externalId, reason: "unknown_type" });
      continue;
    }
    const match = existing.find(
      (r) => !r.external && r.disciplineId === disciplineId && r.startedAt && minutesBetween(r.startedAt, a.startedAt) <= SAME_SESSION_WINDOW_MIN,
    );
    if (match) {
      const current = match.metrics?.model === "endurance" ? match.metrics : undefined;
      const filled = Object.fromEntries(Object.entries(endurancePart(a)).filter(([k]) => current?.[k as keyof EnduranceMetrics] === undefined));
      plan.link.push({ resultId: match.id, external: { provider: a.provider, id: a.externalId }, filled: getDiscipline(disciplineId).metricModel === "endurance" ? filled : {} });
    } else {
      plan.create.push(externalToSessionResult(a, userId, disciplineId));
    }
    known.add(key);
  }
  return plan;
}

/** Séances de l'app à publier vers un fournisseur : réalisées, non issues de ce fournisseur, type connu. */
export function planExport(results: SessionResult[], provider: IntegrationProvider, alreadyExported: ReadonlySet<string>): ExportPayload[] {
  const reverse = new Map<string, string>();
  for (const [type, discipline] of Object.entries(ACTIVITY_TYPE_MAP[provider])) if (!reverse.has(discipline)) reverse.set(discipline, type);
  const out: ExportPayload[] = [];
  for (const r of results) {
    const type = reverse.get(r.disciplineId);
    if (r.status === "skipped" || r.external || alreadyExported.has(r.id) || !type || !r.startedAt || !r.durationSec) continue;
    const m = r.metrics?.model === "endurance" ? r.metrics : undefined;
    out.push({
      provider,
      type,
      startedAt: r.startedAt,
      durationSec: r.durationSec,
      sessionId: r.id,
      title: getDiscipline(r.disciplineId).name,
      ...(m?.distanceM ? { distanceM: m.distanceM } : {}),
      ...(m?.elevationGainM !== undefined ? { elevationGainM: m.elevationGainM } : {}),
      ...(m?.avgHeartRate ? { avgHeartRate: m.avgHeartRate } : {}),
    });
  }
  return out;
}
