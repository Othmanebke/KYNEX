import { describe, expect, it } from "vitest";
import { planWeek, type Block } from "@kynex/core";
import { describeBlock, formatDistance, formatSec } from "./blocks";

describe("formats", () => {
  it("durées et distances lisibles", () => {
    expect(formatSec(45)).toBe("45 s");
    expect(formatSec(60)).toBe("1 min");
    expect(formatSec(90)).toBe("1 min 30");
    expect(formatSec(125)).toBe("2 min 05");
    expect(formatDistance(400)).toBe("400 m");
    expect(formatDistance(5000)).toBe("5 km");
    expect(formatDistance(1500).replace(/\s/g, " ")).toBe("1,5 km");
  });
});

describe("blocs", () => {
  it("séries avec charge : RPE, jamais de kg inventé", () => {
    const b: Block = { kind: "loaded_sets", exerciseId: "bench_press", sets: 4, reps: { min: 6, max: 10 }, load: { type: "rpe", rpe: 8 }, restSec: 120 };
    const v = describeBlock(b);
    expect(v.title).toBe("Développé couché barre");
    expect(v.prescription).toBe("4 × 6–10 reps · RPE 8 · repos 2 min");
    expect(v.prescription).not.toMatch(/kg/);
  });

  it("échauffement : une dose par exercice, côté précisé", () => {
    const v = describeBlock({ kind: "warmup", label: "Échauffement", items: [{ exerciseId: "leg_swings", reps: 10, perSide: true }, { exerciseId: "childs_pose", durationSec: 60 }] });
    expect(v.exercises.map((e) => e.dose)).toEqual(["10 reps par côté", "1 min"]);
    expect(v.prescription).toBeNull();
  });

  it("fractionné et sortie : intensité, récupération, terrain, effort perçu", () => {
    expect(describeBlock({ kind: "intervals", exerciseId: "strides", repeats: 4, workSec: 20, restSec: 70, restMode: "walk", intensity: "moderate", label: "Lignes droites" }).prescription).toBe(
      "4 × 20 s · modérée · récup 1 min 10 en marchant",
    );
    expect(describeBlock({ kind: "outdoor", exerciseId: "long_run", targetDurationMin: 43, terrain: "mixed", intensity: "moderate", targetRpe: 5 }).prescription).toBe(
      "43 min · terrain varié · modérée · effort perçu 5/10",
    );
  });

  it("décrit tous les blocs générés pour une semaine réelle, sans identifiant brut", () => {
    const w = planWeek({
      userId: "u",
      disciplines: [
        { disciplineId: "strength_training", level: "intermediate", priority: 1 },
        { disciplineId: "hiit", level: "intermediate", priority: 2 },
        { disciplineId: "running", level: "intermediate", priority: 3 },
      ],
      goals: ["general_fitness"],
      equipment: ["barbell", "dumbbells", "bench", "squat_rack", "kettlebell", "pullup_bar"],
      environments: ["gym", "outdoor", "home_no_equipment"],
      availability: [
        { day: "mon", maxMinutes: 60 },
        { day: "wed", maxMinutes: 60 },
        { day: "fri", maxMinutes: 60 },
        { day: "sun", maxMinutes: 90 },
      ],
    });
    const blocks = w.days.flatMap((d) => d.sessions.flatMap((s) => s.plan.blocks));
    expect(blocks.length).toBeGreaterThan(5);
    for (const b of blocks) {
      const v = describeBlock(b);
      expect(v.title.length).toBeGreaterThan(0);
      for (const e of v.exercises) expect(e.name, `nom manquant pour ${e.exerciseId}`).not.toBe(e.exerciseId);
    }
  });
});
