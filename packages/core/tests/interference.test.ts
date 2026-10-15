import { describe, expect, it } from "vitest";
import type { TrainingLoad } from "../src/blocks/schema.js";
import { moveSession } from "../src/planner/edit.js";
import { gapHours, isHeavyLegs, isVmaLike, violationsBetween, type SessionTraits } from "../src/planner/interference.js";
import { planWeek } from "../src/planner/orchestrator.js";
import type { WeeklySchedule } from "../src/planner/types.js";
import { gymProfile } from "./fixtures.js";

const load = (l: Partial<TrainingLoad>): TrainingLoad => ({ lowerBody: 0, upperBody: 0, cardio: 0, impact: 0, cns: 0, ...l });
const heavyLegs: SessionTraits = { disciplineId: "strength_training", variant: "lower", intensity: "high", load: load({ lowerBody: 3, cns: 3, cardio: 1 }) };
const vma: SessionTraits = { disciplineId: "running", variant: "intervals", intensity: "high", load: load({ lowerBody: 2, cardio: 3, impact: 3, cns: 2 }) };
const easyRun: SessionTraits = { disciplineId: "running", variant: "easy", intensity: "low", load: load({ lowerBody: 1, cardio: 2, impact: 2 }) };
const all = (s: WeeklySchedule) => s.days.flatMap((d) => d.sessions);

describe("règles d'interférence", () => {
  it("reconnaît une séance lourde jambes et un fractionné", () => {
    expect(isHeavyLegs(heavyLegs)).toBe(true);
    expect(isVmaLike(vma)).toBe(true);
    expect(isVmaLike(easyRun)).toBe(false);
  });

  it("calcule l'écart en semaine cyclique", () => {
    expect(gapHours("mon", "tue")).toBe(24);
    expect(gapHours("sun", "mon")).toBe(24);
    expect(gapHours("tue", "mon")).toBe(144);
    expect(gapHours("wed", "wed")).toBe(0);
  });

  it("fractionné le lendemain (ou le jour même) d'une séance lourde jambes : erreur", () => {
    for (const day of ["tue", "mon"] as const) {
      const v = violationsBetween({ day: "mon", traits: heavyLegs }, { day, traits: vma });
      expect(v.find((x) => x.rule.id === "heavy_legs_then_vma")?.rule.severity, day).toBe("error");
    }
  });

  it("fractionné 48 h après : plus d'interférence jambes → VMA ; l'ordre inverse est signalé à part", () => {
    expect(violationsBetween({ day: "mon", traits: heavyLegs }, { day: "wed", traits: vma }).map((v) => v.rule.id)).not.toContain("heavy_legs_then_vma");
    const reverse = violationsBetween({ day: "mon", traits: vma }, { day: "tue", traits: heavyLegs }).map((v) => v.rule.id);
    expect(reverse).toContain("vma_then_heavy_legs");
    expect(reverse).not.toContain("heavy_legs_then_vma");
  });

  it("un footing facile après une séance jambes ne déclenche aucune interférence", () => {
    expect(violationsBetween({ day: "mon", traits: heavyLegs }, { day: "tue", traits: easyRun })).toEqual([]);
  });
});

describe("orchestrateur : interférences et stress nerveux", () => {
  // Coureur prioritaire + force maximale : le cas typique de conflit jambes / VMA.
  const profile = gymProfile({
    // Objectif vitesse : la séance de qualité de la semaine est un fractionné (VMA).
    goals: ["max_strength", "speed"],
    disciplines: [
      { disciplineId: "running", level: "intermediate", priority: 1, sessionsPerWeek: 3 },
      { disciplineId: "strength_training", level: "intermediate", priority: 2, sessionsPerWeek: 2 },
    ],
  });
  const week = planWeek(profile);

  it("ne place jamais un fractionné moins de 24 h après une séance lourde jambes", () => {
    expect(week.conflicts.filter((c) => c.code === "heavy_legs_then_vma")).toEqual([]);
  });

  it("aucune séance intense consécutive grâce à l'amélioration du placement", () => {
    expect(week.conflicts.filter((c) => c.code === "high_then_high")).toEqual([]);
  });

  it("respecte le budget SNC hebdomadaire", () => {
    expect(week.conflicts.filter((c) => c.code === "cns_overload")).toEqual([]);
  });

  it("détecte l'interférence si l'utilisateur déplace le fractionné, et propose une alternative", () => {
    const sessions = all(week);
    const legs = sessions.find((s) => isHeavyLegs({ disciplineId: s.disciplineId, variant: s.slot.variant, intensity: s.plan.intensity, load: s.plan.load }));
    const intervals = sessions.find((s) => s.slot.variant === "intervals");
    expect(legs).toBeDefined();
    expect(intervals).toBeDefined();
    const days = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
    const target = days[(days.indexOf(legs!.day) + 1) % 7]!;
    const moved = moveSession(week, intervals!.id, target, profile);
    const c = moved.conflicts.find((x) => x.code === "heavy_legs_then_vma");
    expect(c?.severity).toBe("error");
    expect(c!.suggestions.some((s) => s.type === "move")).toBe(true);
  });
});
