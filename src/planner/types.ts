import type { SessionPlan } from "../blocks/schema.js";
import type { ValidationIssue } from "../blocks/validate.js";
import type { Weekday } from "../domain/enums.js";
import type { SlotSpec } from "../generators/types.js";
import type { Conflict } from "./conflicts.js";

export interface ScheduledSession {
  id: string;
  day: Weekday;
  disciplineId: string;
  priority: 1 | 2 | 3;
  slot: SlotSpec;
  plan: SessionPlan;
  /** Séance courte greffée à une autre le même jour (mobilité). */
  addOn: boolean;
  issues: ValidationIssue[];
  /** Présent si la séance remplace une séance prévue suite à un signalement (fatigue, douleur). */
  substitution?: { reason: string; replacedSessionId: string; replacedTitle: string };
}

export interface DayPlan {
  day: Weekday;
  available: boolean;
  maxMinutes: number;
  sessions: ScheduledSession[];
  /** "rest" = repos planifié, "active_recovery" = uniquement de la mobilité légère. */
  status: "training" | "active_recovery" | "rest";
}

export interface WeeklySchedule {
  weekIndex: number;
  days: DayPlan[];
  conflicts: Conflict[];
  /** Informations sur les arbitrages faits (séances non placées, adaptations…). */
  notes: string[];
}
