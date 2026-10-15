import { resistanceVolumeKg, type SessionResult } from "./metrics.js";

/** Statistiques communes à toutes les disciplines (comparables entre elles). */
export interface CommonStats {
  sessionsCompleted: number;
  /** Somme des durées mesurées uniquement ; les séances sans durée ne sont pas estimées. */
  measuredDurationSec: number;
  sessionsWithoutDuration: number;
}

/** Statistiques propres à une discipline : chaque champ n'existe que s'il a pu être mesuré. */
export type DisciplineStats =
  | { model: "resistance"; totalSets: number; totalReps: number; volumeKg?: number }
  | { model: "endurance"; totalDistanceM?: number; totalElevationM?: number; avgPaceSecPerKm?: number }
  | { model: "skill"; totalReps: number; skillsAchieved: string[] }
  | { model: "practice"; practices: Record<string, number> }
  | { model: "wod"; byFormat: Record<string, number> };

export function commonStats(results: SessionResult[]): CommonStats {
  const done = results.filter((r) => r.status !== "skipped");
  return {
    sessionsCompleted: done.length,
    measuredDurationSec: done.reduce((s, r) => s + (r.durationSec ?? 0), 0),
    sessionsWithoutDuration: done.filter((r) => r.durationSec === undefined).length,
  };
}

/** Agrège les métriques d'UNE discipline. Lève une erreur si on mélange les disciplines. */
export function disciplineStats(disciplineId: string, results: SessionResult[]): DisciplineStats | undefined {
  if (results.some((r) => r.disciplineId !== disciplineId)) throw new Error("Les statistiques ne mélangent pas plusieurs disciplines.");
  const ms = results.filter((r) => r.status !== "skipped" && r.metrics).map((r) => r.metrics!);
  const first = ms[0];
  if (!first) return undefined;

  switch (first.model) {
    case "resistance": {
      const all = ms.filter((m) => m.model === "resistance");
      const sets = all.flatMap((m) => m.exercises.flatMap((e) => e.sets));
      const vols = all.map(resistanceVolumeKg);
      return {
        model: "resistance",
        totalSets: sets.length,
        totalReps: sets.reduce((s, x) => s + x.reps, 0),
        ...(vols.every((v) => v !== undefined) ? { volumeKg: vols.reduce((a, b) => a + b!, 0) } : {}),
      };
    }
    case "endurance": {
      const all = ms.filter((m) => m.model === "endurance");
      const withDist = all.filter((m) => m.distanceM !== undefined);
      const out: DisciplineStats = { model: "endurance" };
      if (withDist.length) {
        out.totalDistanceM = withDist.reduce((s, m) => s + m.distanceM!, 0);
        const totalTime = withDist.reduce((s, m) => s + m.durationSec, 0);
        out.avgPaceSecPerKm = Math.round(totalTime / (out.totalDistanceM / 1000));
      }
      const withElev = all.filter((m) => m.elevationGainM !== undefined);
      if (withElev.length) out.totalElevationM = withElev.reduce((s, m) => s + m.elevationGainM!, 0);
      return out;
    }
    case "skill": {
      const all = ms.filter((m) => m.model === "skill");
      return {
        model: "skill",
        totalReps: all.flatMap((m) => m.exercises.flatMap((e) => e.sets)).reduce((s, x) => s + (x.reps ?? 0), 0),
        skillsAchieved: [...new Set(all.flatMap((m) => m.skillsAchieved))],
      };
    }
    case "practice": {
      const practices: Record<string, number> = {};
      for (const m of ms) if (m.model === "practice") for (const p of m.practices) practices[p] = (practices[p] ?? 0) + 1;
      return { model: "practice", practices };
    }
    case "wod": {
      const byFormat: Record<string, number> = {};
      for (const m of ms) if (m.model === "wod") byFormat[m.format] = (byFormat[m.format] ?? 0) + 1;
      return { model: "wod", byFormat };
    }
  }
}
