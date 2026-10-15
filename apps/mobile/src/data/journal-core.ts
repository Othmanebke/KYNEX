import {
  compliance,
  emptyState,
  liveToSessionResult,
  plannedForStreak,
  recordSession,
  restDayCheckIn,
  SessionResultSchema,
  type Achievement,
  type GamificationState,
  type LiveState,
  type PersonalRecord,
  type SessionResult,
  type SessionResultInput,
  type WeeklySchedule,
  type XpEvent,
} from "@kynex/core";

/**
 * Journal d'entraînement d'un utilisateur : résultats de séances, état de gamification
 * et records. Logique pure (testée sans React) ; la persistance est faite par journal.tsx.
 */
export interface Journal {
  results: SessionResult[];
  game: GamificationState;
  records: PersonalRecord[];
}

export const emptyJournal = (userId: string): Journal => ({ results: [], game: emptyState(userId), records: [] });

export interface SaveOutcome {
  journal: Journal;
  result: SessionResult;
  xp: XpEvent[];
  improvedRecords: PersonalRecord[];
  unlocked: Achievement[];
}

/** Séances de la semaine planifiée réellement réalisées (au moins partiellement). */
export function completedPlanned(schedule: WeeklySchedule, results: SessionResult[]): Set<string> {
  const ids = new Set(schedule.days.flatMap((d) => d.sessions.map((s) => s.id)));
  return new Set(results.filter((r) => r.status !== "skipped" && r.plannedSessionId && ids.has(r.plannedSessionId)).map((r) => r.plannedSessionId!));
}

/** Met à jour la semaine de régularité (prévu / réalisé / semaine de récupération). */
function withWeek(game: GamificationState, schedule: WeeklySchedule, results: SessionResult[], weekStart: string): GamificationState {
  const planned = plannedForStreak(schedule);
  const done = completedPlanned(schedule, results);
  const completed = schedule.days.flatMap((d) => d.sessions).filter((s) => !s.substitution && !s.addOn && done.has(s.id)).length;
  const recoveryWeek = schedule.days.some((d) => d.sessions.some((s) => s.substitution));
  const weeks = [...game.weeks.filter((w) => w.weekStart !== weekStart), { weekStart, planned, completed, recoveryWeek }];
  return { ...game, weeks };
}

function save(j: Journal, input: SessionResultInput, ctx: { schedule: WeeklySchedule; weekStart: string; planned: boolean; liveCompliance?: ReturnType<typeof compliance> }): SaveOutcome {
  const result = SessionResultSchema.parse(input);
  const sameDay = j.results.filter((r) => r.date === result.date && j.game.events.some((e) => e.sourceId === r.id && e.reason === "session")).length;
  const done = completedPlanned(ctx.schedule, j.results);
  const out = recordSession(j.game, new Map(j.records.map((r) => [r.key, r])), result, {
    rewardedToday: sameDay,
    planned: ctx.planned,
    completedThisWeek: done.size,
    plannedThisWeek: plannedForStreak(ctx.schedule),
    ...(ctx.liveCompliance ? { compliance: ctx.liveCompliance } : {}),
  });
  const results = [...j.results.filter((r) => r.id !== result.id), result];
  const game = withWeek(out.state, ctx.schedule, results, ctx.weekStart);
  return { journal: { results, game, records: [...out.records.values()] }, result, xp: out.xp, improvedRecords: out.improvedRecords, unlocked: out.unlocked };
}

/** Enregistre une séance réalisée en direct : uniquement ce qui a été mesuré ou saisi. */
export function saveLiveSession(
  j: Journal,
  live: LiveState,
  input: { resultId: string; userId: string; date: string; perceivedEffort?: number; painReported?: boolean },
  ctx: { schedule: WeeklySchedule; weekStart: string },
): SaveOutcome {
  const result = liveToSessionResult(live, input);
  return save(j, result, { ...ctx, planned: !!live.plannedSessionId, liveCompliance: compliance(live) });
}

/** Séance notée à la main (disciplines en suivi seul, ou séance faite sans l'app). */
export function saveManualSession(j: Journal, input: SessionResultInput, ctx: { schedule: WeeklySchedule; weekStart: string }): SaveOutcome {
  return save(j, input, { ...ctx, planned: !!input.plannedSessionId });
}

export function saveRestCheckIn(j: Journal, date: string): { journal: Journal; unlocked: Achievement[] } {
  const out = restDayCheckIn(j.game, date);
  return { journal: { ...j, game: out.state }, unlocked: out.unlocked };
}

/** Relit un journal stocké ; ce qui ne passe plus la validation est écarté, jamais corrigé en silence. */
export function reviveJournal(raw: unknown, userId: string): Journal {
  if (!raw || typeof raw !== "object") return emptyJournal(userId);
  const r = raw as Partial<Journal>;
  const results = (Array.isArray(r.results) ? r.results : []).flatMap((x) => {
    const p = SessionResultSchema.safeParse(x);
    return p.success ? [p.data] : [];
  });
  const game = r.game && typeof r.game === "object" && Array.isArray((r.game as GamificationState).events) ? (r.game as GamificationState) : emptyState(userId);
  const records = Array.isArray(r.records) ? r.records : [];
  return { results, game, records };
}
