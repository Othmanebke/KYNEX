import { z } from "zod";
import { IntegrationProviderSchema, SplitSchema, type IntegrationProvider, type SessionResult } from "../tracking/metrics.js";

/**
 * Activité telle que reçue d'un service tiers, normalisée par l'adaptateur du fournisseur.
 * Tous les champs de mesure sont optionnels : un champ non fourni reste absent.
 */
export const ExternalActivitySchema = z.object({
  provider: IntegrationProviderSchema,
  externalId: z.string().min(1),
  /** Type d'activité dans le vocabulaire du fournisseur (ex : Strava « Run »). */
  type: z.string().min(1),
  startedAt: z.string().datetime({ offset: true }),
  durationSec: z.number().int().positive().optional(),
  movingTimeSec: z.number().int().positive().optional(),
  distanceM: z.number().int().positive().optional(),
  elevationGainM: z.number().nonnegative().optional(),
  elevationLossM: z.number().nonnegative().optional(),
  avgSpeedKmh: z.number().positive().optional(),
  maxSpeedKmh: z.number().positive().optional(),
  avgHeartRate: z.number().int().min(30).max(240).optional(),
  maxHeartRate: z.number().int().min(30).max(240).optional(),
  splits: z.array(SplitSchema).optional(),
  title: z.string().optional(),
});
export type ExternalActivity = z.infer<typeof ExternalActivitySchema>;

export interface ProviderCapabilities {
  /** Lecture des activités (import). */
  read: boolean;
  /** Écriture d'une séance réalisée dans l'app vers le service (export). */
  write: boolean;
  /** Le fournisseur notifie les nouvelles activités (webhook) plutôt qu'un polling. */
  push: boolean;
}

/**
 * Contrat d'un adaptateur. L'implémentation concrète (OAuth, HTTP, HealthKit natif,
 * SDK Health Connect) vit côté client mobile ou serveur ; le domaine ne dépend que de ceci.
 * Les jetons d'accès ne transitent jamais par le domaine.
 */
export interface HealthProvider {
  readonly provider: IntegrationProvider;
  readonly capabilities: ProviderCapabilities;
  /** Activités depuis un curseur opaque (pagination incrémentale). */
  fetchActivities(cursor: string | null): Promise<{ activities: ExternalActivity[]; nextCursor: string | null }>;
  /** Publie une séance ; renvoie l'identifiant attribué par le service. */
  pushSession(payload: ExportPayload): Promise<{ externalId: string }>;
}

/** Données exportées : uniquement ce qui a été mesuré. */
export interface ExportPayload {
  provider: IntegrationProvider;
  type: string;
  startedAt: string;
  durationSec: number;
  sessionId: string;
  distanceM?: number;
  elevationGainM?: number;
  avgHeartRate?: number;
  title: string;
}

export type ImportedResult = SessionResult & { external: NonNullable<SessionResult["external"]> };
