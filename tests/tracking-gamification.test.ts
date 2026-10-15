import { describe, expect, it } from "vitest";
import { challengeProgress } from "../src/gamification/challenges.js";
import { emptyState, levelFromXp, sessionXp, totalXp, weeklyStreak, xpByDiscipline, type SessionXpContext } from "../src/gamification/engine.js";
import { dailyQuests } from "../src/gamification/quests.js";
import { planWeek } from "../src/planner/orchestrator.js";
import { recordSession, restDayCheckIn } from "../src/progress.js";
import { paceSecPerKm, resistanceVolumeKg, SessionResultSchema, type SessionResultInput } from "../src/tracking/metrics.js";
import type { PersonalRecord } from "../src/tracking/records.js";
import { commonStats, disciplineStats } from "../src/tracking/stats.js";
import { gymProfile } from "./fixtures.js";

const squat = (id: string, date: string, loadKg?: number, reps = 5): SessionResultInput => ({
  id,
  userId: "u1",
  disciplineId: "strength_training",
  date,
  status: "completed",
  durationSec: 3600,
  metrics: { model: "resistance", exercises: [{ exerciseId: "back_squat", sets: [{ reps, ...(loadKg !== undefined ? { loadKg } : {}) }] }] },
});
const run = (id: string, date: string, distanceM?: number, durationSec = 1800): SessionResultInput => ({
  id,
  userId: "u1",
  disciplineId: "running",
  date,
  status: "completed",
  durationSec,
  metrics: { model: "endurance", durationSec, ...(distanceM ? { distanceM } : {}) },
});
const ctx: SessionXpContext = { rewardedToday: 0, planned: true, completedThisWeek: 0, plannedThisWeek: 4 };

describe("suivi : métriques typées et données absentes", () => {
  it("refuse des métriques incompatibles avec la discipline", () => {
    const bad = { ...run("r", "2026-10-01", 5000), disciplineId: "strength_training" };
    expect(SessionResultSchema.safeParse(bad).success).toBe(false);
  });

  it("valide la cohérence du protocole WOD", () => {
    const wod = { id: "w", userId: "u1", disciplineId: "hiit", date: "2026-10-01", status: "completed", metrics: { model: "wod", format: "amrap", movements: [{ exerciseId: "burpee", reps: 10 }], durationSec: 600, result: { type: "time", seconds: 600 } } };
    // Rejeté pour la seule bonne raison : un AMRAP ne se mesure pas en temps.
    expect(SessionResultSchema.safeParse({ ...wod, metrics: { ...wod.metrics, result: { type: "rounds_reps", rounds: 5, reps: 3 } } }).success).toBe(true);
    expect(SessionResultSchema.safeParse(wod).success).toBe(false);
  });

  it("ne calcule ni volume ni allure si une donnée manque", () => {
    const s = SessionResultSchema.parse(squat("a", "2026-10-01"));
    expect(s.metrics?.model === "resistance" && resistanceVolumeKg(s.metrics)).toBeUndefined();
    const r = SessionResultSchema.parse(run("b", "2026-10-01"));
    expect(r.metrics?.model === "endurance" && paceSecPerKm(r.metrics)).toBeUndefined();
    const r2 = SessionResultSchema.parse(run("c", "2026-10-01", 5000, 1500));
    expect(r2.metrics?.model === "endurance" && paceSecPerKm(r2.metrics)).toBe(300);
  });

  it("refuse d'agréger des disciplines différentes", () => {
    const rs = [squat("a", "2026-10-01", 100), run("b", "2026-10-02", 5000)].map((x) => SessionResultSchema.parse(x));
    expect(() => disciplineStats("strength_training", rs)).toThrow();
    expect(commonStats(rs).sessionsCompleted).toBe(2);
  });

  it("statistiques d'endurance : la distance totale ignore les séances sans distance au lieu de l'estimer", () => {
    const rs = [run("a", "2026-10-01", 5000, 1500), run("b", "2026-10-02")].map((x) => SessionResultSchema.parse(x));
    expect(disciplineStats("running", rs)).toEqual({ model: "endurance", totalDistanceM: 5000, avgPaceSecPerKm: 300 });
  });
});

describe("records personnels", () => {
  it("compare uniquement des records de même nature", () => {
    let state = emptyState("u1");
    let records = new Map<string, PersonalRecord>();
    const r1 = recordSession(state, records, squat("s1", "2026-10-01", 80, 5), ctx);
    const r2 = recordSession(r1.state, r1.records, squat("s2", "2026-10-03", 90, 3), ctx);
    // 90 kg × 3 ne bat pas 80 kg × 5 : ce sont deux records distincts.
    expect([...r2.records.keys()].sort()).toEqual(["strength_training:back_squat:load@3", "strength_training:back_squat:load@5"]);
    const r3 = recordSession(r2.state, r2.records, run("r1", "2026-10-04", 3000, 900), ctx);
    expect([...r3.records.keys()].some((k) => k.includes("best_pace"))).toBe(false);
    state = r3.state;
    records = r3.records;
    expect(state.personalRecordsCount).toBe(4);
  });
});

describe("gamification", () => {
  it("l'XP ne dépend pas de la performance physique", () => {
    const light = sessionXp(SessionResultSchema.parse(squat("a", "2026-10-01", 40)), ctx, []);
    const heavy = sessionXp(SessionResultSchema.parse(squat("b", "2026-10-01", 200)), ctx, []);
    const sum = (xs: { amount: number }[]) => xs.reduce((s, x) => s + x.amount, 0);
    expect(sum(light)).toBe(sum(heavy));
  });

  it("une séance hors plan au-delà du volume prévu rapporte moins, et l'XP quotidienne est plafonnée", () => {
    const res = SessionResultSchema.parse(run("x", "2026-10-01", 5000));
    const sum = (xs: { amount: number }[]) => xs.reduce((s, x) => s + x.amount, 0);
    const normal = sum(sessionXp(res, ctx, []));
    const beyond = sum(sessionXp(res, { ...ctx, planned: false, completedThisWeek: 4 }, []));
    expect(beyond).toBeLessThan(normal / 2);
    expect(sessionXp(res, { ...ctx, rewardedToday: 2 }, [])).toEqual([]);
  });

  it("une séance non réalisée ne retire pas d'XP", () => {
    const skipped = SessionResultSchema.parse({ id: "k", userId: "u1", disciplineId: "running", date: "2026-10-01", status: "skipped" });
    expect(sessionXp(skipped, ctx, [])).toEqual([]);
  });

  it("enregistrer deux fois la même séance ne double pas l'XP", () => {
    const a = recordSession(emptyState("u1"), new Map(), squat("s1", "2026-10-01", 60), ctx);
    const b = recordSession(a.state, a.records, squat("s1", "2026-10-01", 60), ctx);
    expect(totalXp(b.state)).toBe(totalXp(a.state));
  });

  it("niveau global et progression par discipline", () => {
    let st = emptyState("u1");
    let rec = new Map<string, PersonalRecord>();
    for (let i = 0; i < 6; i++) {
      const out = recordSession(st, rec, i % 2 ? run(`r${i}`, `2026-10-0${i + 1}`, 5000) : squat(`s${i}`, `2026-10-0${i + 1}`, 60), ctx);
      st = out.state;
      rec = out.records;
    }
    expect(levelFromXp(totalXp(st)).level).toBeGreaterThan(1);
    expect(Object.keys(xpByDiscipline(st)).sort()).toEqual(["running", "strength_training"]);
    expect(st.achievements).toEqual(expect.arrayContaining(["first_session", "first_strength_training", "first_running", "first_record"]));
  });

  it("le repos planifié et les semaines de récupération ne cassent pas la série", () => {
    expect(
      weeklyStreak([
        { weekStart: "2026-09-07", planned: 4, completed: 4, recoveryWeek: false },
        { weekStart: "2026-09-14", planned: 2, completed: 0, recoveryWeek: true },
        { weekStart: "2026-09-21", planned: 4, completed: 3, recoveryWeek: false },
      ]),
    ).toBe(2);
    expect(
      weeklyStreak([
        { weekStart: "2026-09-14", planned: 4, completed: 1, recoveryWeek: false },
        { weekStart: "2026-09-21", planned: 4, completed: 4, recoveryWeek: false },
      ]),
    ).toBe(1);
  });

  it("le bilan d'un jour de repos est récompensé", () => {
    const { state } = restDayCheckIn(emptyState("u1"), "2026-10-02");
    expect(totalXp(state)).toBeGreaterThan(0);
  });

  it("aucune quête d'entraînement en cas de blessure ; quête de récupération un jour de repos", () => {
    const week = planWeek(gymProfile());
    const injured = dailyQuests(week, "mon", { fatigue: "normal", injured: true });
    expect(injured.every((q) => q.goal.type !== "complete_planned_session")).toBe(true);
    const restDay = week.days.find((d) => d.status === "rest")!;
    expect(dailyQuests(week, restDay.day, { fatigue: "normal", injured: false })[0]!.goal.type).toBe("rest_day_check_in");
  });

  it("défi personnel : seules les données mesurées comptent", () => {
    const rs = [run("a", "2026-10-01", 5000), run("b", "2026-10-02")].map((x) => SessionResultSchema.parse(x));
    const p = challengeProgress({ id: "c", title: "20 km en octobre", metric: "distance_m", disciplineId: "running", target: 20000, from: "2026-10-01", to: "2026-10-31" }, rs);
    expect(p).toEqual({ current: 5000, target: 20000, done: false, sessionsMissingMeasure: 1 });
  });
});
