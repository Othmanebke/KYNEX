import type { SessionPlan, TrainingLoad } from "../blocks/schema.js";
import type { Intensity } from "../domain/enums.js";
import type { AvailabilityContext } from "../exercises/filter.js";
import type { TrainingProfile, UserDiscipline } from "../profile/schema.js";

/**
 * Spécification d'un créneau, décidée par le générateur de la discipline (règles métier
 * hebdomadaires propres), puis placée dans la semaine par l'orchestrateur.
 */
export interface SlotSpec {
  disciplineId: string;
  /** Type de séance propre à la discipline : "upper", "long_run", "amrap", "hips"… */
  variant: string;
  /** Index du créneau dans la semaine pour cette discipline (rotation des contenus). */
  index: number;
  intensity: Intensity;
  load: TrainingLoad;
  minMinutes: number;
  preferredMinutes: number;
  /** Peut être greffé en complément d'une autre séance le même jour (ex : mobilité). */
  canBeAddOn: boolean;
}

export interface WeekContext {
  profile: TrainingProfile;
  discipline: UserDiscipline;
  availability: AvailabilityContext;
  /** Semaine du cycle (0 = première semaine), pour la progression. */
  weekIndex: number;
  /** Plafond d'intensité imposé par l'état de forme ou par l'utilisateur. */
  intensityCap: Intensity;
  /** Multiplicateur de volume (1 = normal, < 1 = allègement). */
  volumeFactor: number;
}

export interface GenerateRequest extends WeekContext {
  slot: SlotSpec;
  sessionId: string;
  /** Temps réellement disponible pour cette séance ce jour-là. */
  durationMin: number;
}

export interface SessionGenerator {
  readonly disciplineId: string;
  /** Types de séance produits (variante → libellé), exposés au catalogue (activity_types). */
  readonly variants: Readonly<Record<string, string>>;
  planSlots(count: number, ctx: WeekContext): SlotSpec[];
  generate(req: GenerateRequest): SessionPlan;
}

const ORDER: Intensity[] = ["recovery", "low", "moderate", "high"];
export const intensityRank = (i: Intensity): number => ORDER.indexOf(i);
export const capIntensity = (i: Intensity, cap: Intensity): Intensity => (intensityRank(i) > intensityRank(cap) ? cap : i);
export const lowerIntensity = (i: Intensity): Intensity => ORDER[Math.max(0, intensityRank(i) - 1)]!;

/**
 * Stress nerveux après plafonnement : chaque cran d'intensité retiré par rapport à
 * l'intensité naturelle de la séance retire un point de SNC (charges moins lourdes, moins de vitesse).
 */
export const cnsAfterCap = (base: number, natural: Intensity, actual: Intensity): number =>
  Math.max(0, base - Math.max(0, intensityRank(natural) - intensityRank(actual)));
