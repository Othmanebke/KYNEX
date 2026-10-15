import { describe, expect, it } from "vitest";
import { emptyState, parseProfile, planWeek, type SessionResult } from "@kynex/core";
import { allQuests, questRewards } from "./quests";

const profile = parseProfile({
  userId: "u1",
  disciplines: [
    { disciplineId: "strength_training", level: "intermediate", priority: 1 },
    { disciplineId: "running", level: "intermediate", priority: 2 },
    { disciplineId: "mobility", level: "beginner", priority: 3 },
  ],
  goals: ["general_fitness"],
  equipment: ["barbell", "dumbbells", "bench", "squat_rack"],
  environments: ["gym", "outdoor", "home_no_equipment"],
  availability: [
    { day: "mon", maxMinutes: 60 },
    { day: "tue", maxMinutes: 60 },
    { day: "thu", maxMinutes: 60 },
    { day: "sat", maxMinutes: 90 },
  ],
});
const schedule = planWeek(profile);
const monSession = schedule.days[0]!.sessions[0]!;

describe("quêtes", () => {
  it("la quête du jour se valide avec la séance prévue réalisée", () => {
    const results: SessionResult[] = [{ id: "r", userId: "u1", disciplineId: monSession.disciplineId, plannedSessionId: monSession.id, date: "2026-10-12", status: "completed", painReported: false }];
    const ctx = { schedule, weekResults: results, game: emptyState("u1"), today: "2026-10-12", todayWeekday: "mon" as const };
    const q = allQuests(ctx, profile.wellness);
    expect(q.daily[0]?.done).toBe(true);
    const ratio = q.weekly.find((x) => x.quest.goal.type === "complete_ratio_of_plan")!;
    expect(ratio.current).toBe(1);
    expect(ratio.done).toBe(false);
  });

  it("une quête terminée rapporte son XP une seule fois", () => {
    const results: SessionResult[] = [{ id: "r", userId: "u1", disciplineId: monSession.disciplineId, plannedSessionId: monSession.id, date: "2026-10-12", status: "completed", painReported: false }];
    const game = emptyState("u1");
    const ctx = { schedule, weekResults: results, game, today: "2026-10-12", todayWeekday: "mon" as const };
    const q = allQuests(ctx, profile.wellness);
    const first = questRewards([...q.daily, ...q.weekly], game, "2026-10-12", "2026-10-12");
    expect(first.length).toBeGreaterThan(0);
    const again = questRewards([...q.daily, ...q.weekly], { ...game, events: first }, "2026-10-12", "2026-10-12");
    expect(again).toEqual([]);
  });

  it("fatigue importante : pas de quête d'entraînement, un bilan de forme", () => {
    const ctx = { schedule, weekResults: [], game: emptyState("u1"), today: "2026-10-12", todayWeekday: "mon" as const };
    const q = allQuests(ctx, { fatigue: "high", injured: false });
    expect(q.daily.map((x) => x.quest.goal.type)).toEqual(["wellness_check_in"]);
  });
});
