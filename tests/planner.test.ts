import { describe, expect, it } from "vitest";
import { downgradeSession, moveSession, removeSession } from "../src/planner/edit.js";
import { planWeek } from "../src/planner/orchestrator.js";
import type { WeeklySchedule } from "../src/planner/types.js";
import { gymProfile, homeNoEquipment } from "./fixtures.js";

const all = (s: WeeklySchedule) => s.days.flatMap((d) => d.sessions);
const mains = (s: WeeklySchedule) => all(s).filter((x) => !x.addOn);

describe("calendrier hebdomadaire multisports", () => {
  const profile = gymProfile();
  const week = planWeek(profile);

  it("ne place rien sur un jour indisponible ou un jour de repos préféré", () => {
    for (const d of week.days) if (!d.available) expect(d.sessions, d.day).toHaveLength(0);
    expect(week.days.find((d) => d.day === "fri")!.status).toBe("rest");
  });

  it("combine plusieurs disciplines selon les priorités", () => {
    const count = (id: string) => mains(week).filter((s) => s.disciplineId === id).length;
    expect(count("strength_training")).toBe(3);
    expect(count("running")).toBe(2);
    expect(all(week).some((s) => s.disciplineId === "mobility")).toBe(true);
  });

  it("garde au moins un jour de repos et évite les séances intenses consécutives", () => {
    expect(week.days.some((d) => d.status === "rest")).toBe(true);
    expect(week.conflicts.filter((c) => c.code === "high_then_high" || c.code === "no_rest_day" || c.code === "heavy_legs_then_vma")).toEqual([]);
  });

  it("respecte la durée disponible de chaque jour", () => {
    expect(week.conflicts.filter((c) => c.code === "duration_exceeded")).toEqual([]);
    expect(week.conflicts.filter((c) => c.severity === "error")).toEqual([]);
  });

  it("toutes les séances générées sont valides", () => {
    for (const s of all(week)) expect(s.issues.filter((i) => i.severity === "error"), s.id).toEqual([]);
  });

  it("détecte un conflit quand l'utilisateur rapproche deux séances exigeantes, et propose des alternatives", () => {
    const high = mains(week).filter((s) => s.plan.intensity === "high");
    expect(high.length).toBeGreaterThanOrEqual(2);
    const [a, b] = high as [typeof high[0], typeof high[0]];
    const days = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
    const nextDay = days[(days.indexOf(a.day) + 1) % 7]!;
    const moved = moveSession(week, b.id, nextDay, profile);
    const conflict = moved.conflicts.find((c) => ["high_then_high", "lower_body_overlap", "upper_body_overlap", "unavailable_day"].includes(c.code));
    expect(conflict).toBeDefined();
    expect(conflict!.suggestions.length).toBeGreaterThan(0);
  });

  it("permet de supprimer une séance", () => {
    const target = mains(week).find((s) => s.priority === 2)!;
    const after = removeSession(week, target.id, profile);
    expect(all(after).some((s) => s.id === target.id)).toBe(false);
    expect(all(after).length).toBe(all(week).length - 1);
  });

  it("propose une version allégée d'une séance intense", () => {
    const heavy = mains(week).find((s) => s.plan.intensity === "high")!;
    const after = downgradeSession(week, heavy.id, profile);
    expect(all(after).find((s) => s.id === heavy.id)!.plan.intensity).not.toBe("high");
  });

  it("au-delà du plafond de séances intenses, la discipline secondaire passe en variante modérée", () => {
    expect(mains(week).filter((s) => s.plan.intensity === "high").length).toBeLessThanOrEqual(3);
    expect(week.notes.join(" ")).toMatch(/Course à pied : séances intenses remplacées/);
  });

  it("allège un fractionné en footing en réappliquant les règles de la course", () => {
    const runner = gymProfile({ disciplines: [{ disciplineId: "running", level: "intermediate", priority: 1, sessionsPerWeek: 3 }] });
    const w = planWeek(runner);
    const quality = mains(w).find((s) => s.plan.intensity === "high")!;
    expect(["tempo", "intervals"]).toContain(quality.slot.variant);
    const replaced = all(downgradeSession(w, quality.id, runner)).find((s) => s.id === quality.id)!;
    expect(replaced.slot.variant).toBe("easy");
  });

  it("une séance courante n'est jamais plus longue que la sortie longue", () => {
    const runs = mains(week).filter((s) => s.disciplineId === "running");
    const long = runs.find((s) => s.slot.variant === "long")!;
    for (const r of runs) expect(r.plan.estimatedMinutes).toBeLessThanOrEqual(long.plan.estimatedMinutes);
  });
});

describe("état de forme et contraintes", () => {
  it("blessure déclarée : uniquement de la mobilité douce, aucune séance intense", () => {
    const week = planWeek(gymProfile({ wellness: { fatigue: "normal", injured: true } }));
    expect(all(week).every((s) => s.disciplineId === "mobility")).toBe(true);
    expect(all(week).every((s) => s.plan.intensity !== "high")).toBe(true);
    expect(week.notes.join(" ")).toMatch(/professionnel de santé/);
  });

  it("fatigue importante : aucune séance intense", () => {
    const week = planWeek(gymProfile({ wellness: { fatigue: "high", injured: false } }));
    expect(all(week).filter((s) => s.plan.intensity === "high")).toEqual([]);
    expect(mains(week).length).toBeGreaterThan(0);
  });

  it("indique honnêtement qu'une discipline n'est pas encore programmable", () => {
    const week = planWeek(gymProfile({ disciplines: [...gymProfile().disciplines, { disciplineId: "swimming", level: "beginner", priority: 3 }] }));
    expect(all(week).some((s) => s.disciplineId === "swimming")).toBe(false);
    expect(week.notes.join(" ")).toMatch(/Natation : suivi manuel/);
  });

  it("réduit le volume quand les disponibilités sont insuffisantes et l'explique", () => {
    const week = planWeek(homeNoEquipment({ disciplines: [
      { disciplineId: "hiit", level: "beginner", priority: 1, sessionsPerWeek: 4 },
      { disciplineId: "calisthenics", level: "beginner", priority: 2, sessionsPerWeek: 3 },
    ] }));
    expect(mains(week).length).toBeLessThanOrEqual(4);
    expect(week.notes.some((n) => /au lieu de/.test(n))).toBe(true);
  });

  it("un utilisateur sans matériel à la maison obtient une semaine complète réalisable", () => {
    const week = planWeek(homeNoEquipment());
    expect(mains(week).length).toBeGreaterThanOrEqual(3);
    expect(week.conflicts.filter((c) => c.code === "infeasible")).toEqual([]);
  });
});
