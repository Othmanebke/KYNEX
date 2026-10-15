import { describe, expect, it } from "vitest";
import { createLiveState, expandSteps, reduceLive, type SessionPlan } from "@kynex/core";
import { clock, elapsedMs, nextPreview, roundText, stepTitle, targetText } from "./live-view";

const plan: SessionPlan = {
  id: "p1",
  disciplineId: "strength_training",
  title: "Test",
  intensity: "high",
  estimatedMinutes: 30,
  load: { lowerBody: 1, upperBody: 3, cardio: 1, impact: 0, cns: 1 },
  notes: [],
  blocks: [
    { kind: "warmup", items: [{ exerciseId: "leg_swings", reps: 10, perSide: true }] },
    { kind: "loaded_sets", exerciseId: "bench_press", sets: 2, reps: { min: 6, max: 10 }, load: { type: "rpe", rpe: 8 }, restSec: 90 },
  ],
};

describe("séance en direct : présentation", () => {
  it("nomme les étapes en français, jamais par leur identifiant", () => {
    const steps = expandSteps(plan);
    expect(steps.map(stepTitle)).toEqual(["Balancés de jambes", "Développé couché barre", "Repos", "Développé couché barre"]);
  });

  it("décrit la cible prescrite et le numéro de série", () => {
    const [, set1, rest] = expandSteps(plan);
    expect(targetText(set1!)).toBe("6–10 reps · RPE 8");
    expect(roundText(set1!)).toBe("Série 1 / 2");
    expect(targetText(rest!)).toBeNull();
  });

  it("annonce l'étape suivante et mesure le temps hors pauses", () => {
    let s = reduceLive(createLiveState(plan, "x"), { type: "start", at: 0 });
    expect(nextPreview(s)).toBe("Développé couché barre · 6–10 reps · RPE 8");
    s = reduceLive(s, { type: "pause", at: 10_000 });
    s = reduceLive(s, { type: "resume", at: 70_000 });
    expect(elapsedMs(s, 80_000)).toBe(20_000);
    expect(clock(61_000)).toBe("1:01");
    expect(clock(0)).toBe("0:00");
  });
});
