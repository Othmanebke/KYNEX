import { describe, expect, it } from "vitest";
import type { PersonalRecord, SessionResult } from "@kynex/core";
import { dayLabel, groupByDay, recordLabel, recordValue, resultSummary, weeklyCounts } from "./history";

const base = { userId: "u", painReported: false } as const;

describe("historique", () => {
  it("records : noms d'exercices en français, valeurs avec unité", () => {
    const r: PersonalRecord = { key: "strength_training:bench_press:load@8", disciplineId: "strength_training", label: "bench_press — 8 rép.", value: 62.5, unit: "kg", better: "higher", sessionId: "s", date: "2026-10-12" };
    expect(recordLabel(r)).toBe("Développé couché barre — 8 rép.");
    expect(recordValue(r).replace(/\s/g, " ")).toBe("62,5 kg");
    expect(recordLabel({ ...r, key: "running:best_pace_over_5000m", unit: "sec_per_km", value: 330 })).toBe("Meilleure allure (≥ 5 km)");
    expect(recordValue({ ...r, unit: "sec_per_km", value: 330 })).toBe("5:30 /km");
  });

  it("une mesure absente est dite absente, jamais 0", () => {
    const r: SessionResult = { ...base, id: "a", disciplineId: "swimming", date: "2026-10-12", status: "completed" };
    expect(resultSummary(r)).toEqual(["durée non mesurée", "aucune mesure saisie"]);
    const run: SessionResult = { ...base, id: "b", disciplineId: "running", date: "2026-10-12", status: "completed", durationSec: 1800, perceivedEffort: 6, metrics: { model: "endurance", durationSec: 1800, distanceM: 5200, source: "live" } };
    expect(resultSummary(run)).toEqual(["30 min", "5,2 km", "effort 6/10"]);
  });

  it("compte les séances par semaine sur 8 semaines, sans les séances non réalisées", () => {
    const now = new Date(2026, 9, 15);
    const rs: SessionResult[] = [
      { ...base, id: "1", disciplineId: "running", date: "2026-10-12", status: "completed" },
      { ...base, id: "2", disciplineId: "running", date: "2026-10-14", status: "partial" },
      { ...base, id: "3", disciplineId: "running", date: "2026-10-05", status: "completed" },
      { ...base, id: "4", disciplineId: "running", date: "2026-10-13", status: "skipped" },
    ];
    const w = weeklyCounts(rs, now);
    expect(w).toHaveLength(8);
    expect(w.at(-1)).toMatchObject({ weekStart: "2026-10-12", count: 2 });
    expect(w.at(-2)).toMatchObject({ weekStart: "2026-10-05", count: 1 });
  });

  it("regroupe par jour et nomme les jours", () => {
    const now = new Date(2026, 9, 15);
    expect(dayLabel("2026-10-15", now)).toBe("Aujourd'hui");
    expect(dayLabel("2026-10-14", now)).toBe("Hier");
    expect(dayLabel("2026-10-12", now)).toBe("Lundi 12 octobre");
    const g = groupByDay([
      { ...base, id: "1", disciplineId: "running", date: "2026-10-12", status: "completed" },
      { ...base, id: "2", disciplineId: "running", date: "2026-10-14", status: "completed" },
    ]);
    expect(g.map((x) => x.date)).toEqual(["2026-10-14", "2026-10-12"]);
  });
});
