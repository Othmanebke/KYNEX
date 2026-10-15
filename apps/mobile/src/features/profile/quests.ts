import { dailyQuests, weeklyQuests, type GamificationState, type Quest, type SessionResult, type Weekday, type WeeklySchedule, type Wellness, type XpEvent } from "@kynex/core";
import { completedPlanned } from "@/data/journal-core";

/** Progression des quêtes du socle, calculée sur les données réelles de la semaine. */
export interface QuestProgress {
  quest: Quest;
  current: number;
  target: number;
  done: boolean;
}

export interface QuestContext {
  schedule: WeeklySchedule;
  /** Résultats de la semaine en cours uniquement. */
  weekResults: SessionResult[];
  game: GamificationState;
  today: string;
  todayWeekday: Weekday;
}

export function questProgress(q: Quest, c: QuestContext): QuestProgress {
  const done = completedPlanned(c.schedule, c.weekResults);
  const realised = c.weekResults.filter((r) => r.status !== "skipped");
  const make = (current: number, target: number): QuestProgress => ({ quest: q, current: Math.min(current, target), target, done: current >= target });
  switch (q.goal.type) {
    case "complete_planned_session":
      return make(done.has(q.goal.sessionId) ? 1 : 0, 1);
    case "rest_day_check_in":
      return make(c.game.events.some((e) => e.reason === "rest_day_check_in" && e.date === c.today) ? 1 : 0, 1);
    case "wellness_check_in":
      return make(c.schedule.days.find((d) => d.day === c.todayWeekday)?.sessions.some((s) => s.substitution) ? 1 : 0, 1);
    case "complete_ratio_of_plan": {
      const planned = c.schedule.days.flatMap((d) => d.sessions).filter((s) => !s.substitution && !s.addOn).length;
      const target = Math.max(1, Math.ceil(planned * q.goal.ratio));
      return make(done.size, target);
    }
    case "practice_distinct_disciplines":
      return make(new Set(realised.map((r) => r.disciplineId)).size, q.goal.count);
    case "complete_discipline": {
      const id = q.goal.disciplineId;
      return make(realised.some((r) => r.disciplineId === id) ? 1 : 0, 1);
    }
  }
}

export function allQuests(c: QuestContext, wellness: Wellness): { daily: QuestProgress[]; weekly: QuestProgress[] } {
  return {
    daily: dailyQuests(c.schedule, c.todayWeekday, wellness).map((q) => questProgress(q, c)),
    weekly: weeklyQuests(c.schedule, wellness).map((q) => questProgress(q, c)),
  };
}

/** XP des quêtes terminées et pas encore récompensées (une seule fois par quête et par semaine). */
export function questRewards(progress: QuestProgress[], game: GamificationState, weekStart: string, today: string): XpEvent[] {
  const known = new Set(game.events.map((e) => e.id));
  return progress
    .filter((p) => p.done)
    .map((p) => ({ id: `quest:${weekStart}:${p.quest.id}`, date: today, amount: p.quest.xp, reason: "quest" as const, sourceId: p.quest.id }))
    .filter((e) => !known.has(e.id));
}
