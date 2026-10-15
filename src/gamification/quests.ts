import type { Weekday } from "../domain/enums.js";
import type { Wellness } from "../profile/schema.js";
import type { WeeklySchedule } from "../planner/types.js";

export interface Quest {
  id: string;
  scope: "daily" | "weekly";
  title: string;
  xp: number;
  /** Objectif vérifiable : jamais « faire plus que prévu ». */
  goal:
    | { type: "complete_planned_session"; sessionId: string }
    | { type: "rest_day_check_in" }
    | { type: "wellness_check_in" }
    | { type: "complete_ratio_of_plan"; ratio: number }
    | { type: "practice_distinct_disciplines"; count: number }
    | { type: "complete_discipline"; disciplineId: string };
}

/** Quêtes du jour, dérivées du plan et de l'état de forme déclaré. */
export function dailyQuests(schedule: WeeklySchedule, day: Weekday, wellness: Wellness): Quest[] {
  const plan = schedule.days.find((d) => d.day === day);
  if (!plan) return [];
  if (wellness.injured || wellness.fatigue === "high") {
    // Pas de quête d'entraînement : on valorise l'écoute de soi.
    return [{ id: `d:${day}:wellness`, scope: "daily", title: "Faire un bilan de forme", xp: 10, goal: { type: "wellness_check_in" } }];
  }
  if (plan.status === "rest") {
    return [{ id: `d:${day}:rest`, scope: "daily", title: "Jour de repos : noter sa récupération", xp: 10, goal: { type: "rest_day_check_in" } }];
  }
  return plan.sessions.map((s) => ({
    id: `d:${day}:${s.id}`,
    scope: "daily" as const,
    title: `Réaliser : ${s.plan.title}`,
    xp: s.addOn ? 10 : 20,
    goal: { type: "complete_planned_session" as const, sessionId: s.id },
  }));
}

export function weeklyQuests(schedule: WeeklySchedule, wellness: Wellness): Quest[] {
  const sessions = schedule.days.flatMap((d) => d.sessions);
  const w = schedule.weekIndex;
  const quests: Quest[] = [];
  if (sessions.length) {
    quests.push({ id: `w${w}:ratio`, scope: "weekly", title: "Réaliser au moins 70 % des séances prévues", xp: 60, goal: { type: "complete_ratio_of_plan", ratio: 0.7 } });
  }
  const disciplines = [...new Set(sessions.map((s) => s.disciplineId))];
  if (disciplines.length >= 2 && !wellness.injured) {
    quests.push({ id: `w${w}:multi`, scope: "weekly", title: "Pratiquer 2 disciplines cette semaine", xp: 40, goal: { type: "practice_distinct_disciplines", count: 2 } });
  }
  if (disciplines.includes("mobility")) {
    quests.push({ id: `w${w}:mobility`, scope: "weekly", title: "Prendre soin de sa mobilité", xp: 30, goal: { type: "complete_discipline", disciplineId: "mobility" } });
  }
  return quests;
}
