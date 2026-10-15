import { WEEKDAYS, type Level, type Weekday } from "../domain/enums.js";
import { intensityRank } from "../generators/types.js";
import { violationsBetween, WEEKLY_CNS_BUDGET, type InterferenceRuleId, type SessionTraits } from "./interference.js";
import type { DayPlan, ScheduledSession, WeeklySchedule } from "./types.js";

export type ConflictCode =
  | InterferenceRuleId
  | "no_rest_day"
  | "duration_exceeded"
  | "high_volume"
  | "cns_overload"
  | "wellness"
  | "unavailable_day"
  | "infeasible";

export type Suggestion =
  | { type: "move"; sessionId: string; toDay: Weekday }
  | { type: "downgrade"; sessionId: string }
  | { type: "remove"; sessionId: string };

export interface Conflict {
  code: ConflictCode;
  severity: "warning" | "error";
  days: Weekday[];
  sessionIds: string[];
  message: string;
  suggestions: Suggestion[];
}

/** Nombre maximal de séances intenses par semaine selon le niveau le plus élevé déclaré. */
export const MAX_HIGH_PER_WEEK: Record<Level, number> = { beginner: 2, intermediate: 3, advanced: 4 };

export interface ConflictContext {
  level: Level;
  wellness: { fatigue: "normal" | "elevated" | "high"; injured: boolean };
}

export const traitsOf = (s: ScheduledSession): SessionTraits => ({
  disciplineId: s.disciplineId,
  variant: s.slot.variant,
  intensity: s.plan.intensity,
  load: s.plan.load,
});

const mains = (day: DayPlan): ScheduledSession[] => day.sessions.filter((s) => !s.addOn);

/**
 * Détecte les conflits d'une semaine :
 * - interférences entre paires de séances (règles déclaratives, `interference.ts`) ;
 * - contraintes globales : repos, volume intense, budget SNC, durée, disponibilité, état de forme, faisabilité.
 */
export function detectConflicts(schedule: WeeklySchedule, ctx: ConflictContext): Conflict[] {
  const out: Conflict[] = [];
  const all = schedule.days.flatMap((d) => d.sessions);

  for (let i = 0; i < all.length; i++) {
    for (let j = i + 1; j < all.length; j++) {
      const a = all[i]!;
      const b = all[j]!;
      for (const v of violationsBetween({ id: a.id, day: a.day, traits: traitsOf(a) }, { id: b.id, day: b.day, traits: traitsOf(b) })) {
        out.push({
          code: v.rule.id,
          severity: v.rule.severity,
          days: [v.first.day, v.second.day],
          sessionIds: [v.first.id!, v.second.id!],
          message: `${v.rule.describe(v.first.traits, v.second.traits)} (${v.first.day} → ${v.second.day})`,
          suggestions: [],
        });
      }
    }
  }

  if (schedule.days.every((d) => mains(d).length > 0)) {
    out.push({ code: "no_rest_day", severity: "error", days: [...WEEKDAYS], sessionIds: [], message: "Aucun jour de repos dans la semaine : la récupération fait partie du programme.", suggestions: [] });
  }

  for (const day of schedule.days) {
    const total = day.sessions.reduce((s, x) => s + x.plan.estimatedMinutes, 0);
    if (!day.available && day.sessions.length) {
      out.push({ code: "unavailable_day", severity: "error", days: [day.day], sessionIds: day.sessions.map((s) => s.id), message: `Séance prévue un jour indisponible (${day.day}).`, suggestions: [] });
    } else if (day.available && total > day.maxMinutes + 5) {
      out.push({ code: "duration_exceeded", severity: "warning", days: [day.day], sessionIds: day.sessions.map((s) => s.id), message: `${total} min prévues pour ${day.maxMinutes} min disponibles (${day.day}).`, suggestions: [] });
    }
  }

  const high = all.filter((s) => !s.addOn && s.plan.intensity === "high");
  if (high.length > MAX_HIGH_PER_WEEK[ctx.level]) {
    out.push({
      code: "high_volume",
      severity: "warning",
      days: [...new Set(high.map((s) => s.day))],
      sessionIds: high.map((s) => s.id),
      message: `${high.length} séances intenses pour un maximum conseillé de ${MAX_HIGH_PER_WEEK[ctx.level]}.`,
      suggestions: [],
    });
  }

  const cns = all.reduce((s, x) => s + x.plan.load.cns, 0);
  if (cns > WEEKLY_CNS_BUDGET[ctx.level]) {
    const costly = all.filter((s) => s.plan.load.cns >= 2);
    out.push({
      code: "cns_overload",
      severity: "warning",
      days: [...new Set(costly.map((s) => s.day))],
      sessionIds: costly.map((s) => s.id),
      message: `Stress nerveux hebdomadaire ${cns} pour un budget de ${WEEKLY_CNS_BUDGET[ctx.level]} (charges lourdes, fractionné, pliométrie cumulés).`,
      suggestions: [],
    });
  }

  if ((ctx.wellness.injured || ctx.wellness.fatigue === "high") && high.length) {
    out.push({
      code: "wellness",
      severity: "error",
      days: [...new Set(high.map((s) => s.day))],
      sessionIds: high.map((s) => s.id),
      message: "Séance intense prévue malgré une blessure ou une fatigue importante déclarée.",
      suggestions: [],
    });
  }

  for (const s of all) {
    if (s.issues.some((i) => i.severity === "error")) {
      out.push({ code: "infeasible", severity: "error", days: [s.day], sessionIds: [s.id], message: `${s.plan.title} : ${s.issues.map((i) => i.message).join(" ")}`, suggestions: [] });
    }
  }

  return out;
}

export const conflictScore = (conflicts: Conflict[]): number => conflicts.reduce((n, c) => n + (c.severity === "error" ? 10 : 1), 0);

/** Complète chaque conflit par des alternatives concrètes, vérifiées par simulation. */
export function withSuggestions(
  schedule: WeeklySchedule,
  conflicts: Conflict[],
  ctx: ConflictContext,
  simulateMove: (sessionId: string, toDay: Weekday) => WeeklySchedule,
): Conflict[] {
  const baseline = conflictScore(conflicts);
  const sessions = schedule.days.flatMap((d) => d.sessions);
  return conflicts.map((c) => {
    const suggestions: Suggestion[] = [];
    for (const id of c.sessionIds) {
      const session = sessions.find((s) => s.id === id);
      if (!session) continue;
      for (const day of schedule.days) {
        if (day.day === session.day || !day.available || mains(day).length) continue;
        if (conflictScore(detectConflicts(simulateMove(id, day.day), ctx)) < baseline) suggestions.push({ type: "move", sessionId: id, toDay: day.day });
      }
      if (intensityRank(session.plan.intensity) >= 2) suggestions.push({ type: "downgrade", sessionId: id });
      if (session.priority > 1 || c.code === "wellness") suggestions.push({ type: "remove", sessionId: id });
    }
    return { ...c, suggestions: dedupe(suggestions) };
  });
}

function dedupe(xs: Suggestion[]): Suggestion[] {
  const seen = new Set<string>();
  return xs.filter((s) => {
    const k = JSON.stringify(s);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}
