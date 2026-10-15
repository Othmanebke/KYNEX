import { describe, expect, it } from "vitest";
import { ExerciseAssetSchema, findExercise } from "@kynex/core";
import { exerciseImages, exercisesWithImages } from "./exercise-media";

describe("médias d'exercices", () => {
  it("ne référence que des exercices du catalogue", () => {
    for (const id of exercisesWithImages()) expect(findExercise(id), id).toBeDefined();
  });

  it("chaque image respecte le schéma du socle : licence, provenance, taille", () => {
    for (const id of exercisesWithImages()) {
      const imgs = exerciseImages(id);
      expect(imgs.length).toBeGreaterThan(0);
      for (const a of imgs) expect(ExerciseAssetSchema.safeParse(a).success, `${id} ${a.uri}`).toBe(true);
    }
  });

  it("un exercice sans correspondance fidèle n'a pas d'image", () => {
    expect(exerciseImages("burpee")).toEqual([]);
    expect(exerciseImages("easy_run")).toEqual([]);
  });
});
