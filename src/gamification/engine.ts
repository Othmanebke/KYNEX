import type { PersonalRecord } from "../tracking/records.js";
import type { SessionResult } from "../tracking/metrics.js";

/**
 * Principes :
 * - l'XP récompense la séance accomplie et la régularité, jamais la performance brute
 *   (soulever plus lourd ou courir plus vite qu'un autre ne rapporte pas plus) ;
 * - les séances au-delà du plan rapportent moins, et l'XP quotidienne est plafonnée ;
 * - le repos planifié ne casse jamais une série ; une semaine de récupération (fatigue,
 *   blessure) gèle la série au lieu de la rompre.
 */
export const XP_RULES = {
  completed: 50,
  partial: 30,
  plannedBonus: 20,
  /** 1 XP par tranche de 2 minutes MESURÉES, plafonné : aucune durée n'est supposée. */
  durationPer2Min: 1,
  durationCap: 30,
  /** Séance non planifiée au-delà du volume prévu de la semaine : XP réduite. */
  beyondPlanFactor: 0.5,
  /** Nombre maximal de séances rapportant de l'XP dans une même journée. */
  maxRewardedSessionsPerDay: 2,
  personalRecord: 25,
  /** Séance prévue réalisée comme prescrite (ni sautée, ni dépassée). */
  prescriptionRespected: 15,
  restDayCheckIn: 10,
  weeklyGoalMet: 100,
} as const;

export type XpReason = "session" | "planned_bonus" | "duration_bonus" | "personal_record" | "prescription_respected" | "rest_day_check_in" | "weekly_goal" | "quest" | "achievement";

export interface XpEvent {
  /** Clé d'idempotence : un même fait ne rapporte de l'XP qu'une fois. */
  id: string;
  date: string;
  amount: number;
  reason: XpReason;
  disciplineId?: string;
  sourceId: string;
}

export interface WeekRecord {
  /** Lundi de la semaine (AAAA-MM-JJ). */
  weekStart: string;
  planned: number;
  completed: number;
  /** Semaine allégée à cause d'une fatigue/blessure déclarée : gèle la série. */
  recoveryWeek: boolean;
}

export interface GamificationState {
  userId: string;
  events: XpEvent[];
  weeks: WeekRecord[];
  achievements: string[];
  disciplinesPracticed: string[];
  sessionsCompleted: number;
  personalRecordsCount: number;
  skillsAchieved: string[];
}

export const emptyState = (userId: string): GamificationState => ({
  userId,
  events: [],
  weeks: [],
  achievements: [],
  disciplinesPracticed: [],
  sessionsCompleted: 0,
  personalRecordsCount: 0,
  skillsAchieved: [],
});

// ——— Niveaux ———

/** XP cumulée nécessaire pour atteindre un niveau (niveau 1 = 0 XP). */
export const xpForLevel = (level: number): number => Math.round(100 * Math.pow(Math.max(0, level - 1), 1.6));

export function levelFromXp(xp: number): { level: number; current: number; next: number; progress: number } {
  let level = 1;
  while (xpForLevel(level + 1) <= xp) level++;
  const current = xpForLevel(level);
  const next = xpForLevel(level + 1);
  return { level, current, next, progress: (xp - current) / (next - current) };
}

export const totalXp = (s: GamificationState): number => s.events.reduce((t, e) => t + e.amount, 0);

export function xpByDiscipline(s: GamificationState): Record<string, number> {
  const out: Record<string, number> = {};
  for (const e of s.events) if (e.disciplineId) out[e.disciplineId] = (out[e.disciplineId] ?? 0) + e.amount;
  return out;
}

// ——— Attribution ———

export interface SessionXpContext {
  /** Nombre de séances déjà récompensées ce jour-là. */
  rewardedToday: number;
  /** La séance correspond-elle à une séance du plan ? */
  planned: boolean;
  /** Séances réalisées / prévues dans la semaine, AVANT celle-ci. */
  completedThisWeek: number;
  plannedThisWeek: number;
  /** Respect de la prescription mesuré en séance live (absent si séance saisie à la main). */
  compliance?: { workStepsPlanned: number; workStepsDone: number; workStepsAbovePrescription: number; rpeDelta?: number };
}

export function sessionXp(result: SessionResult, ctx: SessionXpContext, prs: PersonalRecord[]): XpEvent[] {
  if (result.status === "skipped" || ctx.rewardedToday >= XP_RULES.maxRewardedSessionsPerDay) return [];
  const beyondPlan = !ctx.planned && ctx.completedThisWeek >= ctx.plannedThisWeek && ctx.plannedThisWeek > 0;
  const factor = beyondPlan ? XP_RULES.beyondPlanFactor : 1;
  const base = result.status === "completed" ? XP_RULES.completed : XP_RULES.partial;
  const ev = (reason: XpReason, amount: number): XpEvent => ({
    id: `${result.id}:${reason}`,
    date: result.date,
    amount: Math.round(amount),
    reason,
    disciplineId: result.disciplineId,
    sourceId: result.id,
  });
  const out = [ev("session", base * factor)];
  if (ctx.planned) out.push(ev("planned_bonus", XP_RULES.plannedBonus));
  if (result.durationSec && !beyondPlan) {
    out.push(ev("duration_bonus", Math.min(XP_RULES.durationCap, Math.floor(result.durationSec / 120) * XP_RULES.durationPer2Min)));
  }
  // Respect des charges prescrites : on récompense la justesse, pas le dépassement.
  if (ctx.planned && ctx.compliance && respectsPrescription(ctx.compliance) && !result.painReported) {
    out.push(ev("prescription_respected", XP_RULES.prescriptionRespected));
  }
  // Progression personnelle : au plus un bonus par séance, quel que soit le nombre de records.
  if (prs.length && !result.painReported) out.push(ev("personal_record", XP_RULES.personalRecord));
  return out.filter((e) => e.amount > 0);
}

/**
 * Prescription respectée : au moins 80 % des étapes de travail réalisées, aucune au-dessus
 * de la cible (reps ou RPE > cible + 1), et RPE moyen dans la cible si mesuré.
 */
export function respectsPrescription(c: NonNullable<SessionXpContext["compliance"]>): boolean {
  if (c.workStepsPlanned === 0) return false;
  return c.workStepsDone / c.workStepsPlanned >= 0.8 && c.workStepsAbovePrescription === 0 && (c.rpeDelta === undefined || c.rpeDelta <= 1);
}

export function addEvents(s: GamificationState, events: XpEvent[]): GamificationState {
  const known = new Set(s.events.map((e) => e.id));
  return { ...s, events: [...s.events, ...events.filter((e) => !known.has(e.id))] };
}

// ——— Régularité ———

export const weekGoalMet = (w: WeekRecord): boolean => w.planned > 0 && w.completed / w.planned >= 0.7;

/**
 * Série de semaines régulières (de la plus récente à la plus ancienne).
 * - semaine atteinte : +1 ;
 * - semaine de récupération ou sans séance prévue : gelée (ni +1, ni rupture) ;
 * - sinon : la série s'arrête.
 */
export function weeklyStreak(weeks: WeekRecord[]): number {
  const sorted = [...weeks].sort((a, b) => b.weekStart.localeCompare(a.weekStart));
  let streak = 0;
  for (const w of sorted) {
    if (weekGoalMet(w)) streak++;
    else if (w.recoveryWeek || w.planned === 0) continue;
    else break;
  }
  return streak;
}
