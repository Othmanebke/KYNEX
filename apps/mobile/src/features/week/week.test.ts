import { describe, expect, it } from "vitest";
import { moveSession, parseProfile, planWeek, type TrainingProfileInput } from "@kynex/core";
import { frenchDays, mondayOf, sortConflicts, suggestionLabel, weekGauges, weekIndexBetween, weekRangeLabel } from "./week";

const input: TrainingProfileInput = {
  userId: "u1",
  disciplines: [
    { disciplineId: "strength_training", level: "intermediate", priority: 1 },
    { disciplineId: "running", level: "intermediate", priority: 2 },
    { disciplineId: "mobility", level: "beginner", priority: 3 },
  ],
  goals: ["muscle_gain"],
  equipment: ["barbell", "dumbbells", "bench", "squat_rack", "cables", "machines", "pullup_bar", "kettlebell", "mat"],
  environments: ["gym", "outdoor", "home_no_equipment"],
  availability: [
    { day: "mon", maxMinutes: 75 },
    { day: "tue", maxMinutes: 60 },
    { day: "wed", maxMinutes: 60 },
    { day: "thu", maxMinutes: 75 },
    { day: "sat", maxMinutes: 120 },
    { day: "sun", maxMinutes: 90 },
  ],
  preferredRestDays: ["fri"],
};

describe("dates de la semaine", () => {
  it("trouve le lundi, y compris depuis un dimanche", () => {
    expect(mondayOf(new Date(2026, 9, 15)).getDate()).toBe(12); // jeudi 15 oct. → lundi 12
    expect(mondayOf(new Date(2026, 9, 18)).getDate()).toBe(12); // dimanche 18 → lundi 12
    expect(mondayOf(new Date(2026, 9, 19)).getDate()).toBe(19);
  });

  it("formate la plage selon le mois et l'année", () => {
    expect(weekRangeLabel(new Date(2026, 9, 12))).toBe("12 – 18 oct.");
    expect(weekRangeLabel(new Date(2026, 9, 26))).toBe("26 oct. – 1 nov.");
    expect(weekRangeLabel(new Date(2025, 11, 29))).toBe("29 déc. 2025 – 4 janv. 2026");
  });

  it("compte les semaines du cycle, sans valeur négative", () => {
    expect(weekIndexBetween(new Date(2026, 9, 12), new Date(2026, 9, 26))).toBe(2);
    expect(weekIndexBetween(new Date(2026, 9, 26), new Date(2026, 9, 12))).toBe(0);
  });
});

describe("textes et jauges", () => {
  it("traduit les codes de jour des messages du socle", () => {
    expect(frenchDays("Deux séances intenses consécutives. (thu → fri)")).toBe("Deux séances intenses consécutives. (jeudi → vendredi)");
    expect(frenchDays("Séance prévue un jour indisponible (fri).")).toBe("Séance prévue un jour indisponible (vendredi).");
    expect(frenchDays("Monday")).toBe("Monday");
  });

  it("calcule les jauges comme la détection de conflits", () => {
    const p = parseProfile(input);
    const g = weekGauges(planWeek(p), p);
    expect(g.intenseMax).toBe(3);
    expect(g.cnsBudget).toBe(8);
    expect(g.availableMinutes).toBe(480);
    expect(g.intense).toBeLessThanOrEqual(g.intenseMax);
  });

  it("met les conflits « à corriger » en premier et nomme chaque suggestion", () => {
    const p = parseProfile(input);
    let w = planWeek(p);
    w = moveSession(w, "w0-strength_training-2", "fri", p);
    const sorted = sortConflicts(w.conflicts);
    expect(sorted[0]?.severity).toBe("error");
    const sug = sorted[0]!.suggestions[0]!;
    expect(suggestionLabel(w, sug)).toMatch(/^(Déplacer|Alléger|Supprimer) « Musculation/);
  });
});

describe("notes du plan", () => {
  it("tutoie, accorde le pluriel, remplace les identifiants et retire les notes de suivi seul", async () => {
    const { readableNotes } = await import("./week");
    const label = (_: string, v: string) => ({ full_a: "Full body A", run_walk: "Course-marche" })[v];
    expect(
      readableNotes(
        [
          "Natation : suivi manuel disponible, génération automatique pas encore proposée.",
          "Sprint & athlétisme : discipline en alpha, séance libre uniquement.",
          "Musculation : 1 séance(s) au lieu de 3 pour respecter vos disponibilités et la récupération.",
          "Course à pied : 2 séance(s) au lieu de 3.",
          "Musculation (full_a) non placée : aucun créneau assez long.",
          "Course à pied (inconnue) non placée : aucun créneau assez long.",
        ],
        label,
      ),
    ).toEqual([
      "Musculation : 1 séance au lieu de 3 pour respecter tes disponibilités et la récupération.",
      "Course à pied : 2 séances au lieu de 3.",
      "Musculation — Full body A non placée : aucun créneau assez long.",
      "Course à pied — séance non placée : aucun créneau assez long.",
    ]);
  });
});

describe("zones du corps", () => {
  it("traduit les zones signalées dans les messages", () => {
    expect(frenchDays("Douleur modérée signalée (knee) : « Course » remplacée.")).toBe("Douleur modérée signalée (genou) : « Course » remplacée.");
  });
});
