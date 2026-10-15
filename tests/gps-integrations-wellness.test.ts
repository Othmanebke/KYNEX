import { describe, expect, it } from "vitest";
import { sessionXp } from "../src/gamification/engine.js";
import { dailyQuests } from "../src/gamification/quests.js";
import { planExport, planImport } from "../src/integrations/sync.js";
import { planWeek } from "../src/planner/orchestrator.js";
import { applyWellnessSignal, plannedForStreak } from "../src/planner/wellness.js";
import { summarizeTrack, type GpsPoint } from "../src/tracking/gps.js";
import { EnduranceMetricsSchema, SessionResultSchema } from "../src/tracking/metrics.js";
import { gymProfile } from "./fixtures.js";

/** Trace synthétique vers le nord : 1° de latitude ≈ 111 195 m. */
function track(opts: { meters: number; secPerKm: number; everySec?: number; altitude?: (i: number) => number; accuracyM?: number }): GpsPoint[] {
  const every = opts.everySec ?? 5;
  const speed = 1000 / opts.secPerKm; // m/s
  const n = Math.round(opts.meters / (speed * every));
  return Array.from({ length: n + 1 }, (_, i) => ({
    lat: 45 + (i * speed * every) / 111_195,
    lon: 5,
    t: i * every * 1000,
    ...(opts.altitude ? { altitudeM: opts.altitude(i) } : {}),
    ...(opts.accuracyM !== undefined ? { accuracyM: opts.accuracyM } : {}),
  }));
}

describe("GPS", () => {
  it("distance, allure et splits au km calculés depuis la trace", () => {
    const s = summarizeTrack(track({ meters: 3000, secPerKm: 300 }))!;
    expect(s.metrics.distanceM).toBeGreaterThan(2980);
    expect(s.metrics.distanceM).toBeLessThan(3020);
    expect(s.metrics.splits!.filter((x) => x.distanceM === 1000)).toHaveLength(3);
    for (const sp of s.metrics.splits!.filter((x) => x.distanceM === 1000)) expect(Math.abs(sp.durationSec - 300)).toBeLessThan(3);
    expect(s.metrics.source).toBe("gps");
    expect(EnduranceMetricsSchema.safeParse(s.metrics).success).toBe(true);
  });

  it("sans altitude, aucun dénivelé n'est inventé ; avec altitude, D+ et D- filtrés du bruit", () => {
    expect(summarizeTrack(track({ meters: 2000, secPerKm: 360 }))!.metrics.elevationGainM).toBeUndefined();
    // Montée régulière de 0,5 m par point puis bruit de ±1 m.
    const hill = summarizeTrack(track({ meters: 2000, secPerKm: 360, altitude: (i) => (i < 60 ? i * 0.5 : 30 + (i % 2)) }))!;
    expect(hill.metrics.elevationGainM).toBeGreaterThanOrEqual(27);
    expect(hill.metrics.elevationGainM).toBeLessThanOrEqual(30);
    expect(hill.metrics.elevationLossM).toBe(0);
  });

  it("écarte les points imprécis et les sauts aberrants", () => {
    const pts = track({ meters: 1000, secPerKm: 300 });
    pts.splice(10, 0, { lat: 46, lon: 5, t: pts[9]!.t + 1000 }); // téléportation de 100 km
    const s = summarizeTrack(pts)!;
    expect(s.pointsRejected).toBe(1);
    expect(s.metrics.distanceM).toBeLessThan(1050);
    expect(summarizeTrack(track({ meters: 1000, secPerKm: 300, accuracyM: 80 }))).toBeNull();
  });

  it("les pauses sont exclues du temps en mouvement", () => {
    const a = track({ meters: 1000, secPerKm: 300 });
    const last = a[a.length - 1]!;
    const b = track({ meters: 1000, secPerKm: 300 }).map((p) => ({ ...p, lat: p.lat + (last.lat - 45), t: p.t + last.t + 120_000 }));
    const s = summarizeTrack([...a, ...b])!;
    expect(s.metrics.durationSec - s.metrics.movingTimeSec!).toBeGreaterThanOrEqual(115);
  });
});

describe("intégrations (Strava, Garmin, Apple Health, Health Connect)", () => {
  const appRun = SessionResultSchema.parse({
    id: "app-1", userId: "u1", disciplineId: "running", date: "2026-10-15", startedAt: "2026-10-15T07:00:00Z", status: "completed",
    durationSec: 1800, metrics: { model: "endurance", durationSec: 1800, distanceM: 5000, source: "live" },
  });

  it("rattache une activité de montre à la séance de l'app sans écraser ses mesures", () => {
    const plan = planImport([appRun], [{ provider: "garmin", externalId: "g1", type: "running", startedAt: "2026-10-15T07:04:00Z", durationSec: 1810, distanceM: 5040, avgHeartRate: 152, elevationGainM: 35 }], "u1");
    expect(plan.create).toEqual([]);
    expect(plan.link).toEqual([{ resultId: "app-1", external: { provider: "garmin", id: "g1" }, filled: { avgHeartRate: 152, elevationGainM: 35 } }]);
  });

  it("crée les nouvelles activités, ignore doublons et types inconnus en le signalant", () => {
    const imported = SessionResultSchema.parse({ id: "strava:9", userId: "u1", disciplineId: "cycling", date: "2026-10-10", status: "completed", external: { provider: "strava", id: "9" } });
    const plan = planImport([imported], [
      { provider: "strava", externalId: "9", type: "Ride", startedAt: "2026-10-10T08:00:00Z", durationSec: 3600 },
      { provider: "strava", externalId: "10", type: "Ride", startedAt: "2026-10-12T08:00:00Z", durationSec: 3600, distanceM: 30000 },
      { provider: "strava", externalId: "11", type: "Kitesurf", startedAt: "2026-10-12T08:00:00Z", durationSec: 3600 },
      { provider: "health_connect", externalId: "hc1", type: "STRENGTH_TRAINING", startedAt: "2026-10-13T18:00:00Z", durationSec: 3000 },
    ], "u1");
    expect(plan.skipped).toEqual([{ externalId: "9", reason: "already_imported" }, { externalId: "11", reason: "unknown_type" }]);
    expect(plan.create.map((r) => r.disciplineId)).toEqual(["cycling", "strength_training"]);
    const ride = plan.create[0]!;
    expect(ride.metrics?.model === "endurance" && ride.metrics.distanceM).toBe(30000);
    // Musculation importée : aucune série inventée.
    expect(plan.create[1]!.metrics).toBeUndefined();
  });

  it("exporte uniquement les séances de l'app, une seule fois, avec les données mesurées", () => {
    const out = planExport([appRun], "strava", new Set());
    expect(out).toEqual([{ provider: "strava", type: "Run", startedAt: "2026-10-15T07:00:00Z", durationSec: 1800, sessionId: "app-1", title: "Course à pied", distanceM: 5000 }]);
    expect(planExport([appRun], "strava", new Set(["app-1"]))).toEqual([]);
  });
});

describe("signalement de fatigue ou de douleur", () => {
  const profile = gymProfile();
  const week = planWeek(profile);
  const trainingDay = week.days.find((d) => d.sessions.some((s) => s.plan.intensity === "high"))!;

  it("fatigue modérée : la séance exigeante devient une mobilité douce, sans pénalité", () => {
    const after = applyWellnessSignal(week, { day: trainingDay.day, kind: "fatigue", severity: "moderate" }, profile);
    const day = after.days.find((d) => d.day === trainingDay.day)!;
    expect(day.sessions.every((s) => s.disciplineId === "mobility")).toBe(true);
    expect(day.sessions.some((s) => s.substitution)).toBe(true);
    expect(plannedForStreak(after)).toBeLessThan(plannedForStreak(week));
  });

  it("douleur au genou : la séance jambes devient une mobilité qui épargne le genou", () => {
    const legDay = week.days.find((d) => d.sessions.some((s) => !s.addOn && s.plan.load.lowerBody >= 2))!;
    const after = applyWellnessSignal(week, { day: legDay.day, kind: "pain", severity: "moderate", region: "knee" }, profile);
    const sub = after.days.find((d) => d.day === legDay.day)!.sessions.find((s) => s.substitution);
    expect(sub).toBeDefined();
    expect(sub!.issues.filter((i) => i.severity === "error")).toEqual([]);
    expect(sub!.plan.focus).toBe("shoulders_spine");
    expect(after.notes.join(" ")).toMatch(/Douleur modérée signalée \(knee\)/);
  });

  it("douleur au genou un jour haut du corps : la séance est conservée", () => {
    const upperDay = week.days.find((d) => d.sessions.some((s) => !s.addOn && s.plan.load.lowerBody === 0 && s.plan.load.impact < 2 && s.plan.load.upperBody >= 2));
    expect(upperDay).toBeDefined();
    const after = applyWellnessSignal(week, { day: upperDay!.day, kind: "pain", severity: "moderate", region: "knee" }, profile);
    expect(after.days.find((d) => d.day === upperDay!.day)!.sessions.map((s) => s.id)).toEqual(upperDay!.sessions.map((s) => s.id));
  });

  it("douleur sévère : repos le jour même et lendemain allégé, aucune quête d'entraînement", () => {
    const after = applyWellnessSignal(week, { day: trainingDay.day, kind: "pain", severity: "severe" }, profile);
    expect(after.days.find((d) => d.day === trainingDay.day)!.sessions).toEqual([]);
    const days = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
    const tomorrow = after.days.find((d) => d.day === days[(days.indexOf(trainingDay.day) + 1) % 7])!;
    expect(tomorrow.sessions.every((s) => s.plan.intensity !== "high")).toBe(true);
    expect(dailyQuests(after, trainingDay.day, { fatigue: "normal", injured: false })[0]!.goal.type).toBe("rest_day_check_in");
  });
});

describe("respect des charges prescrites", () => {
  const res = SessionResultSchema.parse({ id: "x", userId: "u", disciplineId: "strength_training", date: "2026-10-15", status: "completed", durationSec: 3600 });
  const base = { rewardedToday: 0, planned: true, completedThisWeek: 0, plannedThisWeek: 3 };
  const has = (c: Parameters<typeof sessionXp>[1]) => sessionXp(res, c, []).some((e) => e.reason === "prescription_respected");

  it("récompense une séance faite comme prescrite", () => {
    expect(has({ ...base, compliance: { workStepsPlanned: 10, workStepsDone: 10, workStepsAbovePrescription: 0, rpeDelta: 0.5 } })).toBe(true);
  });

  it("ne récompense ni le dépassement, ni une séance tronquée, ni une séance hors plan", () => {
    expect(has({ ...base, compliance: { workStepsPlanned: 10, workStepsDone: 10, workStepsAbovePrescription: 2 } })).toBe(false);
    expect(has({ ...base, compliance: { workStepsPlanned: 10, workStepsDone: 10, workStepsAbovePrescription: 0, rpeDelta: 2 } })).toBe(false);
    expect(has({ ...base, compliance: { workStepsPlanned: 10, workStepsDone: 5, workStepsAbovePrescription: 0 } })).toBe(false);
    expect(has({ ...base, planned: false, compliance: { workStepsPlanned: 10, workStepsDone: 10, workStepsAbovePrescription: 0 } })).toBe(false);
  });
});
