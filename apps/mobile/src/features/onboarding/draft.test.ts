import { describe, expect, it } from "vitest";
import { planWeek } from "@kynex/core";
import { buildProfile, EMPTY_DRAFT, notCoached, reviveDraft, stepBlocker, toggleDiscipline, type ProfileDraft } from "./draft";

const complete: ProfileDraft = {
  disciplines: [
    { disciplineId: "strength_training", level: "intermediate", priority: 1 },
    { disciplineId: "running", level: "beginner", priority: 2 },
  ],
  goals: ["muscle_gain"],
  environments: ["gym", "outdoor"],
  equipment: ["barbell", "bench", "squat_rack"],
  availability: { mon: 60, wed: 60, fri: 45, sat: 90 },
  preferredRestDays: ["sun"],
  lowImpact: false,
  painRegions: [],
};

describe("brouillon du profil", () => {
  it("bloque chaque étape obligatoire avec une raison lisible", () => {
    expect(stepBlocker("disciplines", EMPTY_DRAFT)).toMatch(/au moins une discipline/);
    expect(stepBlocker("objectifs", EMPTY_DRAFT)).toMatch(/objectif/);
    expect(stepBlocker("lieux", EMPTY_DRAFT)).toMatch(/lieu/);
    expect(stepBlocker("semaine", EMPTY_DRAFT)).toMatch(/au moins un jour/);
    expect(stepBlocker("materiel", EMPTY_DRAFT)).toBeNull();
  });

  it("refuse une semaine dont tous les jours disponibles sont en repos", () => {
    expect(stepBlocker("semaine", { ...complete, availability: { mon: 30 }, preferredRestDays: ["mon"] })).toMatch(/repos/);
  });

  it("produit un profil accepté par le schéma du socle et planifiable", () => {
    const r = buildProfile("u1", complete);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const week = planWeek(r.profile, { weekIndex: 0 });
    expect(week.days.length).toBe(7);
  });

  it("renvoie la première étape fautive", () => {
    const r = buildProfile("u1", { ...complete, goals: [] });
    expect(r).toMatchObject({ ok: false, step: "objectifs" });
  });

  it("attribue les priorités 1, 2, 3 puis 3 aux disciplines ajoutées", () => {
    let d = EMPTY_DRAFT;
    for (const id of ["running", "hiit", "mobility", "yoga"]) d = toggleDiscipline(d, id);
    expect(d.disciplines.map((x) => x.priority)).toEqual([1, 2, 3, 3]);
    expect(toggleDiscipline(d, "hiit").disciplines).toHaveLength(3);
  });

  it("signale les disciplines qui ne seront pas programmées", () => {
    const d = toggleDiscipline(toggleDiscipline(EMPTY_DRAFT, "running"), "swimming");
    expect(notCoached(d)).toEqual(["swimming"]);
  });

  it("relit un brouillon abîmé sans planter et retire les disciplines inconnues", () => {
    expect(reviveDraft("n'importe quoi")).toEqual(EMPTY_DRAFT);
    const d = reviveDraft({ disciplines: [{ disciplineId: "inconnue", level: "beginner", priority: 1 }, complete.disciplines[0]], goals: "x" });
    expect(d.disciplines.map((x) => x.disciplineId)).toEqual(["strength_training"]);
    expect(d.goals).toEqual([]);
  });
});
