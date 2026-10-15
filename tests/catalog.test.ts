import { describe, expect, it } from "vitest";
import { getDiscipline, listDisciplines, registerDiscipline, V1_DISCIPLINES } from "../src/domain/disciplines.js";
import { contextFromProfile, isFeasible, resolveExercise } from "../src/exercises/filter.js";
import { EXERCISES, findExercise } from "../src/exercises/library.js";
import { ExerciseSchema } from "../src/exercises/schema.js";
import { getGenerator } from "../src/generators/registry.js";
import { parseProfile } from "../src/profile/schema.js";
import { homeNoEquipment } from "./fixtures.js";

describe("catalogue des disciplines", () => {
  it("couvre les 22 disciplines demandées", () => {
    expect(listDisciplines().length).toBeGreaterThanOrEqual(22);
  });

  it("seules les 5 disciplines V1 sont déclarées pleinement couvertes, chacune avec un générateur", () => {
    const full = listDisciplines({ coverage: "full" }).map((d) => d.id).sort();
    expect(full).toEqual([...V1_DISCIPLINES].sort());
    for (const id of full) expect(getGenerator(id)).toBeDefined();
  });

  it("permet d'ajouter une discipline sans toucher au reste", () => {
    registerDiscipline({
      id: "climbing",
      name: "Escalade",
      family: "other",
      coverage: "alpha",
      metricModel: "skill",
      allowedBlocks: ["warmup", "technique", "timed"],
      typicalEnvironments: ["gym", "outdoor"],
      supportsGoals: ["max_strength"],
      preferredAssets: ["video"],
    });
    expect(getDiscipline("climbing").coverage).toBe("alpha");
    expect(() => registerDiscipline({ ...getDiscipline("climbing") })).toThrow(/déjà/);
  });

  it("n'impose pas l'animation 3D aux sports d'endurance", () => {
    for (const id of ["running", "cycling", "swimming"]) {
      expect(getDiscipline(id).preferredAssets).not.toContain("animation_3d");
    }
    expect(getDiscipline("calisthenics").preferredAssets[0]).toBe("animation_3d");
  });
});

describe("bibliothèque d'exercices", () => {
  it("toutes les références (variantes, alternatives, disciplines) existent", () => {
    for (const ex of EXERCISES) {
      for (const ref of [...ex.easier, ...ex.harder, ...ex.alternatives]) expect(findExercise(ref), `${ex.id} → ${ref}`).toBeDefined();
      for (const d of ex.disciplines) expect(() => getDiscipline(d)).not.toThrow();
    }
  });

  it("chaque discipline V1 dispose d'au moins 8 exercices", () => {
    for (const id of V1_DISCIPLINES) expect(EXERCISES.filter((e) => e.disciplines.includes(id)).length, id).toBeGreaterThanOrEqual(8);
  });

  it("aucun contenu n'est présenté comme validé par un expert", () => {
    expect(EXERCISES.every((e) => e.review.status !== "expert_validated")).toBe(true);
  });

  it("refuse un asset sans licence", () => {
    const r = ExerciseSchema.safeParse({ ...EXERCISES[0], assets: [{ kind: "video", uri: "x.mp4", license: "", source: "studio" }] });
    expect(r.success).toBe(false);
  });
});

describe("filtrage matériel et contraintes", () => {
  const ctx = contextFromProfile(parseProfile(homeNoEquipment()));

  it("exclut les exercices impossibles sans matériel", () => {
    expect(isFeasible(findExercise("back_squat")!, ctx)).toBe(false);
    expect(isFeasible(findExercise("push_up")!, ctx)).toBe(true);
  });

  it("propose une alternative faisable plutôt qu'un exercice impossible", () => {
    const r = resolveExercise("back_squat", { ...ctx, environments: ["home_no_equipment", "home_equipped"] });
    expect(r?.substitutedFor).toBe("back_squat");
    expect(isFeasible(r!.exercise, { ...ctx, environments: ["home_no_equipment", "home_equipped"] })).toBe(true);
  });

  it("renvoie null si aucune alternative n'est réalisable", () => {
    expect(resolveExercise("lat_pulldown", ctx)).toBeNull();
  });

  it("respecte faible impact et zones douloureuses", () => {
    expect(isFeasible(findExercise("burpee")!, { ...ctx, lowImpact: true })).toBe(false);
    expect(isFeasible(findExercise("push_up")!, { ...ctx, painRegions: ["wrist"] })).toBe(false);
  });
});
