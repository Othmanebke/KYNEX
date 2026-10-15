import { describe, expect, it } from "vitest";
import { levelFromXp, SessionResultSchema, totalXp } from "@kynex/core";
import { buildDemo } from "./demo";
import { currentStreak } from "./journal-core";

describe("compte de démonstration", () => {
  const now = new Date(2026, 9, 15, 12);
  const demo = buildDemo(now);

  it("génère un historique valide pour le socle, sans séance dans le futur", () => {
    expect(demo.journal.results.length).toBeGreaterThan(10);
    for (const r of demo.journal.results) {
      expect(SessionResultSchema.safeParse(r).success).toBe(true);
      expect(r.date < "2026-10-15").toBe(true);
    }
  });

  it("produit XP, records, succès et série par le vrai pipeline", () => {
    expect(levelFromXp(totalXp(demo.journal.game)).level).toBeGreaterThan(1);
    expect(demo.journal.records.length).toBeGreaterThan(0);
    expect(demo.journal.game.achievements).toContain("first_session");
    expect(currentStreak(demo.journal.game.weeks, "2026-10-12")).toBeGreaterThanOrEqual(1);
  });

  it("est déterministe", () => {
    expect(buildDemo(now).journal.results.map((r) => r.id)).toEqual(demo.journal.results.map((r) => r.id));
  });
});
