import { describe, expect, it } from "vitest";
import { BlockSchema, estimateBlockSeconds, type SessionPlan } from "../src/blocks/schema.js";
import { hasErrors, validateSession } from "../src/blocks/validate.js";
import { contextFromProfile } from "../src/exercises/filter.js";
import { parseProfile } from "../src/profile/schema.js";
import { homeNoEquipment } from "./fixtures.js";

const session = (disciplineId: string, blocks: unknown[]): unknown => ({
  id: "s1",
  disciplineId,
  title: "test",
  intensity: "moderate",
  estimatedMinutes: 30,
  load: { lowerBody: 1, upperBody: 1, cardio: 1, impact: 0, cns: 0 },
  blocks,
});

describe("schéma des blocs", () => {
  it("accepte des formats variés (séries, distance, AMRAP, extérieur)", () => {
    for (const b of [
      { kind: "sets_reps", exerciseId: "push_up", sets: 3, reps: { min: 8, max: 12 }, restSec: 60 },
      { kind: "distance", exerciseId: "easy_run", distanceM: 5000, intensity: "low" },
      { kind: "amrap", durationMin: 12, movements: [{ exerciseId: "burpee", reps: 10 }] },
      { kind: "outdoor", exerciseId: "long_run", targetDurationMin: 60, intensity: "moderate" },
    ]) {
      expect(BlockSchema.safeParse(b).success, JSON.stringify(b)).toBe(true);
    }
  });

  it("rejette les paramètres incohérents", () => {
    expect(BlockSchema.safeParse({ kind: "sets_reps", exerciseId: "push_up", sets: 3, reps: { min: 12, max: 8 }, restSec: 60 }).success).toBe(false);
    expect(BlockSchema.safeParse({ kind: "intervals", exerciseId: "interval_run", repeats: 5, restSec: 60, intensity: "high" }).success).toBe(false);
    expect(BlockSchema.safeParse({ kind: "outdoor", exerciseId: "long_run", intensity: "low" }).success).toBe(false);
    expect(BlockSchema.safeParse({ kind: "circuit", rounds: 3, movements: [{ exerciseId: "burpee", reps: 10, durationSec: 30 }, { exerciseId: "plank", durationSec: 30 }], restBetweenMovementsSec: 0, restBetweenRoundsSec: 60 }).success).toBe(false);
  });

  it("estime la durée d'un circuit", () => {
    const b = BlockSchema.parse({ kind: "circuit", rounds: 3, movements: [{ exerciseId: "burpee", durationSec: 40 }, { exerciseId: "plank", durationSec: 40 }], restBetweenMovementsSec: 20, restBetweenRoundsSec: 60 });
    expect(estimateBlockSeconds(b)).toBe(3 * (80 + 20) + 2 * 60);
  });
});

describe("validation d'une séance selon la discipline", () => {
  it("refuse un format non adapté à la discipline", () => {
    const issues = validateSession(session("strength_training", [{ kind: "distance", exerciseId: "easy_run", distanceM: 3000, intensity: "low" }]));
    expect(issues.map((i) => i.code)).toContain("block_not_allowed");
  });

  it("refuse une charge sur un exercice non chargeable et une distance sur des pompes", () => {
    const a = validateSession(session("strength_training", [{ kind: "loaded_sets", exerciseId: "plank", sets: 3, reps: 10, load: { type: "rpe", rpe: 8 }, restSec: 60 }]));
    expect(a.map((i) => i.code)).toContain("measure_not_supported");
    const b = validateSession(session("running", [{ kind: "distance", exerciseId: "push_up", distanceM: 100, intensity: "low" }]));
    expect(b.map((i) => i.code)).toEqual(expect.arrayContaining(["measure_not_supported", "exercise_discipline_mismatch"]));
  });

  it("signale un exercice irréalisable avec le matériel de l'utilisateur", () => {
    const ctx = contextFromProfile(parseProfile(homeNoEquipment()));
    const issues = validateSession(session("strength_training", [{ kind: "loaded_sets", exerciseId: "back_squat", sets: 3, reps: 5, load: { type: "rpe", rpe: 8 }, restSec: 120 }]), ctx);
    expect(issues.map((i) => i.code)).toContain("infeasible_exercise");
  });

  it("accepte une séance valide", () => {
    const ok = session("running", [
      { kind: "warmup", items: [{ exerciseId: "leg_swings", reps: 10 }] },
      { kind: "intervals", exerciseId: "interval_run", repeats: 6, workDistanceM: 400, restSec: 90, intensity: "high" },
    ]) as SessionPlan;
    expect(hasErrors(validateSession(ok))).toBe(false);
  });
});
