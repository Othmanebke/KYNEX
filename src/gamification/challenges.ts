import type { SessionResult } from "../tracking/metrics.js";

/** Défi personnel défini par l'utilisateur, mesuré uniquement sur des données enregistrées. */
export interface PersonalChallenge {
  id: string;
  title: string;
  metric: "sessions" | "distance_m" | "duration_sec";
  disciplineId?: string;
  target: number;
  from: string;
  to: string;
}

export interface ChallengeProgress {
  current: number;
  target: number;
  done: boolean;
  /** Séances prises en compte mais sans la mesure demandée : signalées, non estimées. */
  sessionsMissingMeasure: number;
}

export function challengeProgress(c: PersonalChallenge, results: SessionResult[]): ChallengeProgress {
  const inScope = results.filter(
    (r) => r.status !== "skipped" && r.date >= c.from && r.date <= c.to && (!c.disciplineId || r.disciplineId === c.disciplineId),
  );
  let current = 0;
  let missing = 0;
  for (const r of inScope) {
    if (c.metric === "sessions") current += 1;
    else if (c.metric === "duration_sec") {
      if (r.durationSec !== undefined) current += r.durationSec;
      else missing++;
    } else {
      const d = r.metrics?.model === "endurance" ? r.metrics.distanceM : undefined;
      if (d !== undefined) current += d;
      else missing++;
    }
  }
  return { current, target: c.target, done: current >= c.target, sessionsMissingMeasure: missing };
}
