import { newAchievements, type Achievement } from "./gamification/achievements.js";
import { addEvents, sessionXp, XP_RULES, type GamificationState, type SessionXpContext, type XpEvent } from "./gamification/engine.js";
import { SessionResultSchema, type SessionResultInput } from "./tracking/metrics.js";
import { updateRecords, type PersonalRecord } from "./tracking/records.js";

export interface RecordOutcome {
  state: GamificationState;
  records: Map<string, PersonalRecord>;
  xp: XpEvent[];
  improvedRecords: PersonalRecord[];
  unlocked: Achievement[];
}

/** Enregistre une séance réalisée : validation, records, XP et succès, de manière idempotente. */
export function recordSession(
  state: GamificationState,
  records: ReadonlyMap<string, PersonalRecord>,
  input: SessionResultInput,
  ctx: SessionXpContext,
): RecordOutcome {
  const result = SessionResultSchema.parse(input);
  if (state.events.some((e) => e.sourceId === result.id)) {
    return { state, records: new Map(records), xp: [], improvedRecords: [], unlocked: [] };
  }
  const { records: nextRecords, improved } = updateRecords(records, result);
  const xp = sessionXp(result, ctx, improved);
  const done = result.status !== "skipped";
  const skills = result.metrics?.model === "skill" ? result.metrics.skillsAchieved : [];

  let next: GamificationState = addEvents(state, xp);
  next = {
    ...next,
    sessionsCompleted: next.sessionsCompleted + (done ? 1 : 0),
    disciplinesPracticed: done && !next.disciplinesPracticed.includes(result.disciplineId) ? [...next.disciplinesPracticed, result.disciplineId] : next.disciplinesPracticed,
    personalRecordsCount: next.personalRecordsCount + improved.length,
    skillsAchieved: [...new Set([...next.skillsAchieved, ...skills])],
  };
  const unlocked = newAchievements(next);
  next = { ...next, achievements: [...next.achievements, ...unlocked.map((a) => a.id)] };
  return { state: next, records: nextRecords, xp, improvedRecords: improved, unlocked };
}

/** Bilan de récupération un jour de repos planifié : récompensé, jamais exigé. */
export function restDayCheckIn(state: GamificationState, date: string): { state: GamificationState; unlocked: Achievement[] } {
  const ev: XpEvent = { id: `rest:${date}`, date, amount: XP_RULES.restDayCheckIn, reason: "rest_day_check_in", sourceId: `rest:${date}` };
  let next = addEvents(state, [ev]);
  const unlocked = newAchievements(next);
  next = { ...next, achievements: [...next.achievements, ...unlocked.map((a) => a.id)] };
  return { state: next, unlocked };
}
