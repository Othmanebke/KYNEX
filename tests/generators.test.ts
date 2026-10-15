import { describe, expect, it } from "vitest";
import { blockExerciseIds } from "../src/blocks/schema.js";
import { hasErrors, validateSession } from "../src/blocks/validate.js";
import { V1_DISCIPLINES } from "../src/domain/disciplines.js";
import { findExercise } from "../src/exercises/library.js";
import { chooseSplit } from "../src/generators/strength.js";
import { chooseRunVariants, weeklyRunMinutes } from "../src/generators/running.js";
import { getGenerator } from "../src/generators/registry.js";
import { weekContext } from "../src/planner/orchestrator.js";
import { parseProfile, type TrainingProfileInput } from "../src/profile/schema.js";
import { gymProfile, homeNoEquipment, parkProfile } from "./fixtures.js";
import type { Level } from "../src/domain/enums.js";

function generateAll(input: TrainingProfileInput, disciplineId: string, count: number, durationMin: number, weekIndex = 0) {
  const p = parseProfile(input);
  const ud = p.disciplines.find((d) => d.disciplineId === disciplineId)!;
  const ctx = weekContext(p, ud, weekIndex);
  const gen = getGenerator(disciplineId)!;
  return gen.planSlots(count, ctx).map((slot) => ({ slot, plan: gen.generate({ ...ctx, slot, sessionId: `${disciplineId}-${slot.index}`, durationMin }), ctx }));
}

const withDiscipline = (input: TrainingProfileInput, disciplineId: string, level: Level): TrainingProfileInput => ({
  ...input,
  disciplines: [{ disciplineId, level, priority: 1 }],
});

describe("chaque générateur V1 produit des séances valides et réalisables", () => {
  const profiles = { gym: gymProfile(), home: homeNoEquipment(), park: parkProfile() };
  const feasible: Record<string, Array<keyof typeof profiles>> = {
    strength_training: ["gym"],
    calisthenics: ["gym", "home", "park"],
    running: ["gym"],
    hiit: ["gym", "home"],
    mobility: ["gym", "home"],
    hybrid_hyrox: ["gym"],
  };
  for (const disciplineId of [...V1_DISCIPLINES, "hybrid_hyrox"]) {
    for (const where of feasible[disciplineId]!) {
      for (const level of ["beginner", "intermediate", "advanced"] as const) {
        it(`${disciplineId} / ${where} / ${level}`, () => {
          const sessions = generateAll(withDiscipline(profiles[where], disciplineId, level), disciplineId, 3, 45);
          for (const { plan, ctx } of sessions) {
            const issues = validateSession(plan, ctx.availability);
            expect(hasErrors(issues), JSON.stringify(issues)).toBe(false);
            expect(plan.estimatedMinutes).toBeLessThanOrEqual(45 + 8);
          }
        });
      }
    }
  }
});

describe("musculation", () => {
  it("adapte la répartition à la fréquence et au niveau", () => {
    expect(chooseSplit(2, "intermediate")).toEqual(["full_a", "full_b"]);
    expect(chooseSplit(3, "beginner")).toEqual(["full_a", "full_b", "full_c"]);
    expect(chooseSplit(4, "advanced")).toEqual(["upper", "lower", "upper", "lower"]);
  });

  it("n'invente aucune charge en kg sans historique", () => {
    for (const { plan } of generateAll(gymProfile(), "strength_training", 4, 75)) {
      for (const b of plan.blocks) if (b.kind === "loaded_sets") expect(b.load.type).not.toBe("absolute");
    }
  });

  it("une séance haut du corps ne contient pas de squat", () => {
    const upper = generateAll(gymProfile(), "strength_training", 4, 75).find((s) => s.slot.variant === "upper")!;
    const mainBlocks = upper.plan.blocks.filter((b) => b.kind !== "warmup" && b.kind !== "cooldown");
    const patterns = mainBlocks.flatMap(blockExerciseIds).map((id) => findExercise(id)!.pattern);
    expect(patterns).not.toContain("squat");
  });
});

describe("course à pied", () => {
  it("progresse de moins de 10 % par semaine avec une semaine allégée toutes les 4", () => {
    // Chaque semaine de charge est comparée à la dernière semaine de charge (hors semaine allégée).
    const isDeload = (w: number) => w % 4 === 3;
    for (let w = 1; w < 12; w++) {
      if (isDeload(w)) continue;
      const ref = isDeload(w - 1) ? w - 2 : w - 1;
      expect(weeklyRunMinutes("intermediate", w) / weeklyRunMinutes("intermediate", ref), `semaine ${w}`).toBeLessThanOrEqual(1.1);
    }
    expect(weeklyRunMinutes("intermediate", 3)).toBeLessThan(weeklyRunMinutes("intermediate", 2));
  });

  it("garde les débutants en course-marche et limite les séances de qualité", () => {
    expect(chooseRunVariants(3, "beginner", 0, true)).toEqual(["run_walk", "run_walk", "run_walk"]);
    const v = chooseRunVariants(4, "intermediate", 0, false);
    expect(v.filter((x) => x === "tempo" || x === "intervals")).toHaveLength(1);
    expect(v).toContain("long");
  });

  it("remplace la qualité par du facile en cas de fatigue", () => {
    const sessions = generateAll(gymProfile({ wellness: { fatigue: "elevated", injured: false } }), "running", 3, 60);
    expect(sessions.map((s) => s.slot.variant)).not.toContain("tempo");
    expect(sessions.map((s) => s.slot.variant)).not.toContain("intervals");
  });
});

describe("street workout", () => {
  it("sans barre de traction, aucune traction n'est proposée et l'utilisateur est prévenu", () => {
    const sessions = generateAll(withDiscipline(homeNoEquipment(), "calisthenics", "intermediate"), "calisthenics", 3, 45);
    const ids = sessions.flatMap((s) => s.plan.blocks.flatMap(blockExerciseIds));
    expect(ids).not.toContain("pull_up");
    expect(ids).not.toContain("australian_row");
    expect(sessions.some((s) => s.plan.notes.some((n) => n.includes("pull")))).toBe(true);
  });

  it("un niveau avancé au parc reçoit des progressions avancées et un travail de compétence", () => {
    const sessions = generateAll(parkProfile(), "calisthenics", 3, 75);
    const ids = sessions.flatMap((s) => s.plan.blocks.flatMap(blockExerciseIds));
    expect(ids).toEqual(expect.arrayContaining(["archer_push_up", "l_sit_pull_up", "pistol_squat"]));
    expect(sessions.some((s) => s.plan.blocks.some((b) => b.kind === "technique"))).toBe(true);
  });
});

describe("HIIT", () => {
  it("version faible impact : aucun mouvement à impact", () => {
    const input = homeNoEquipment({ constraints: { lowImpact: true, painRegions: [], excludedExercises: [] } });
    for (const { plan } of generateAll(input, "hiit", 4, 30)) {
      for (const id of plan.blocks.flatMap(blockExerciseIds)) expect(findExercise(id)!.highImpact, id).toBe(false);
    }
  });

  it("alterne les formats d'une séance à l'autre", () => {
    const formats = generateAll(homeNoEquipment(), "hiit", 4, 30).map((s) => s.plan.blocks.find((b) => !["warmup", "cooldown"].includes(b.kind))!.kind);
    expect(new Set(formats).size).toBeGreaterThan(1);
  });
});

describe("mobilité", () => {
  it("exclut les exercices sollicitant une zone douloureuse", () => {
    const input = homeNoEquipment({ constraints: { lowImpact: false, painRegions: ["knee"], excludedExercises: [] } });
    for (const { plan } of generateAll(input, "mobility", 3, 20)) {
      for (const id of plan.blocks.flatMap(blockExerciseIds)) expect(findExercise(id)!.stressedRegions, id).not.toContain("knee");
    }
  });
});

describe("hybride (bêta)", () => {
  const hyrox = withDiscipline(gymProfile({ equipment: [...(gymProfile().equipment ?? []), "rower", "custom:medicine_ball"] }), "hybrid_hyrox", "intermediate");

  it("alterne course et ateliers dans la séance « course compromise »", () => {
    const s = generateAll(hyrox, "hybrid_hyrox", 3, 60).find((x) => x.slot.variant === "compromised")!;
    const rounds = s.plan.blocks.filter((b) => b.kind === "circuit");
    expect(rounds.length).toBeGreaterThanOrEqual(2);
    for (const r of rounds) if (r.kind === "circuit") expect(r.movements[0]!.exerciseId).toBe("compromised_run");
    expect(new Set(rounds.map((r) => (r.kind === "circuit" ? r.movements[1]!.exerciseId : ""))).size).toBeGreaterThan(1);
  });

  it("utilise l'équipement personnalisé (médecine-ball) seulement s'il est déclaré", () => {
    const ids = (input: TrainingProfileInput) => generateAll(input, "hybrid_hyrox", 3, 60).flatMap((s) => s.plan.blocks.flatMap(blockExerciseIds));
    expect(ids(hyrox)).toContain("wall_ball");
    expect(ids(withDiscipline(gymProfile(), "hybrid_hyrox", "intermediate"))).not.toContain("wall_ball");
  });

  it("signale son statut bêta à l'utilisateur", () => {
    for (const { plan } of generateAll(hyrox, "hybrid_hyrox", 2, 60)) expect(plan.notes.join(" ")).toMatch(/bêta/);
  });
});
