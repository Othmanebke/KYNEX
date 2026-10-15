import { describe, expect, it } from "vitest";
import { createLiveState, parseProfile, planWeek, reduceLive, type LiveState } from "@kynex/core";
import { completedPlanned, emptyJournal, reviveJournal, saveLiveSession, saveManualSession, saveRestCheckIn } from "./journal-core";

const profile = parseProfile({
  userId: "u1",
  disciplines: [
    { disciplineId: "strength_training", level: "intermediate", priority: 1 },
    { disciplineId: "running", level: "intermediate", priority: 2 },
  ],
  goals: ["muscle_gain"],
  equipment: ["barbell", "dumbbells", "bench", "squat_rack", "kettlebell", "pullup_bar"],
  environments: ["gym", "outdoor"],
  availability: [
    { day: "mon", maxMinutes: 60 },
    { day: "wed", maxMinutes: 60 },
    { day: "fri", maxMinutes: 60 },
    { day: "sun", maxMinutes: 60 },
  ],
});
const schedule = planWeek(profile);
const strength = schedule.days.flatMap((d) => d.sessions).find((s) => s.disciplineId === "strength_training")!;

/** Déroule toute la séance ; `withReps` saisit les répétitions sur chaque série. */
function runAll(withReps: boolean): LiveState {
  let t = 1_000_000;
  let s = reduceLive(createLiveState(strength.plan, strength.id), { type: "start", at: t });
  while (s.status === "running") {
    t += 30_000;
    const step = s.steps[s.current]!;
    s = reduceLive(s, { type: "complete", at: t, actual: withReps && step.kind === "work_reps" ? { reps: 8, rpe: 8 } : {} });
  }
  return s;
}

describe("journal", () => {
  it("enregistre une séance en direct : résultat, XP, premier succès, semaine de régularité", () => {
    const out = saveLiveSession(emptyJournal("u1"), runAll(true), { resultId: "r1", userId: "u1", date: "2026-10-12" }, { schedule, weekStart: "2026-10-12" });
    expect(out.result.status).toBe("completed");
    expect(out.result.metrics?.model).toBe("resistance");
    expect(out.xp.reduce((n, e) => n + e.amount, 0)).toBeGreaterThan(0);
    expect(out.unlocked.map((a) => a.id)).toContain("first_session");
    expect(completedPlanned(schedule, out.journal.results).has(strength.id)).toBe(true);
    expect(out.journal.game.weeks[0]).toMatchObject({ weekStart: "2026-10-12", completed: 1 });
  });

  it("une série validée sans saisie n'invente pas de répétitions", () => {
    const out = saveLiveSession(emptyJournal("u1"), runAll(false), { resultId: "r2", userId: "u1", date: "2026-10-12" }, { schedule, weekStart: "2026-10-12" });
    expect(out.result.metrics).toBeUndefined();
  });

  it("idempotent : la même séance n'est pas comptée deux fois", () => {
    const live = runAll(true);
    const a = saveLiveSession(emptyJournal("u1"), live, { resultId: "r3", userId: "u1", date: "2026-10-12" }, { schedule, weekStart: "2026-10-12" });
    const b = saveLiveSession(a.journal, live, { resultId: "r3", userId: "u1", date: "2026-10-12" }, { schedule, weekStart: "2026-10-12" });
    expect(b.journal.results).toHaveLength(1);
    expect(b.xp).toEqual([]);
  });

  it("séance notée à la main pour une discipline en suivi seul, et bilan de repos", () => {
    const m = saveManualSession(emptyJournal("u1"), { id: "m1", userId: "u1", disciplineId: "swimming", date: "2026-10-13", status: "completed", durationSec: 1800 }, { schedule, weekStart: "2026-10-12" });
    expect(m.result.disciplineId).toBe("swimming");
    const r = saveRestCheckIn(m.journal, "2026-10-14");
    expect(r.journal.game.events.some((e) => e.reason === "rest_day_check_in")).toBe(true);
  });

  it("relit un journal abîmé en écartant ce qui est invalide", () => {
    const j = reviveJournal({ results: [{ id: "x" }, { id: "ok", userId: "u1", disciplineId: "running", date: "2026-10-12", status: "completed" }] }, "u1");
    expect(j.results.map((r) => r.id)).toEqual(["ok"]);
  });
});
