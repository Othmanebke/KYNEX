import type { Environment, Equipment, Level, MovementPattern } from "../domain/enums.js";
import { levelRank, type TrainingProfile } from "../profile/schema.js";
import { EXERCISES, findExercise } from "./library.js";
import type { Exercise } from "./schema.js";

export interface AvailabilityContext {
  equipment: readonly Equipment[];
  environments: readonly Environment[];
  lowImpact: boolean;
  painRegions: TrainingProfile["constraints"]["painRegions"];
  excludedExercises: readonly string[];
}

export function contextFromProfile(p: TrainingProfile): AvailabilityContext {
  return {
    equipment: p.equipment,
    environments: p.environments,
    lowImpact: p.constraints.lowImpact,
    painRegions: p.constraints.painRegions,
    excludedExercises: p.constraints.excludedExercises,
  };
}

export type Infeasibility = "equipment" | "environment" | "impact" | "pain" | "excluded";

export function whyInfeasible(ex: Exercise, ctx: AvailabilityContext): Infeasibility[] {
  const reasons: Infeasibility[] = [];
  const owned = new Set<string>(["bodyweight", ...ctx.equipment]);
  if (!ex.equipmentOptions.some((set) => set.every((item) => owned.has(item)))) reasons.push("equipment");
  if (!ex.environments.some((e) => ctx.environments.includes(e))) reasons.push("environment");
  if (ctx.lowImpact && ex.highImpact) reasons.push("impact");
  if (ex.stressedRegions.some((r) => ctx.painRegions.includes(r))) reasons.push("pain");
  if (ctx.excludedExercises.includes(ex.id)) reasons.push("excluded");
  return reasons;
}

export const isFeasible = (ex: Exercise, ctx: AvailabilityContext): boolean => whyInfeasible(ex, ctx).length === 0;

export interface Resolution {
  exercise: Exercise;
  /** Renseigné si l'exercice demandé a été remplacé par une alternative. */
  substitutedFor?: string;
}

/**
 * Renvoie l'exercice s'il est faisable, sinon la première alternative (ou variante plus facile)
 * faisable, sinon `null`. Jamais d'exercice impossible sans alternative signalée.
 */
export function resolveExercise(id: string, ctx: AvailabilityContext): Resolution | null {
  const ex = findExercise(id);
  if (!ex) return null;
  if (isFeasible(ex, ctx)) return { exercise: ex };
  const seen = new Set([id]);
  const queue = [...ex.alternatives, ...ex.easier];
  while (queue.length) {
    const next = queue.shift()!;
    if (seen.has(next)) continue;
    seen.add(next);
    const alt = findExercise(next);
    if (!alt) continue;
    if (isFeasible(alt, ctx)) return { exercise: alt, substitutedFor: id };
    queue.push(...alt.alternatives, ...alt.easier);
  }
  return null;
}

export interface CandidateQuery {
  discipline: string;
  pattern?: MovementPattern;
  maxLevel: Level;
  categories?: string[];
  excludeCategories?: string[];
}

/** Exercices faisables d'une discipline, triés du plus exigeant (≤ niveau) au plus simple. */
export function candidates(q: CandidateQuery, ctx: AvailabilityContext): Exercise[] {
  return EXERCISES.filter(
    (e) =>
      e.disciplines.includes(q.discipline) &&
      (!q.pattern || e.pattern === q.pattern) &&
      levelRank(e.level) <= levelRank(q.maxLevel) &&
      (!q.categories || q.categories.some((c) => e.categories.includes(c))) &&
      (!q.excludeCategories || !q.excludeCategories.some((c) => e.categories.includes(c))) &&
      isFeasible(e, ctx),
  ).sort((a, b) => levelRank(b.level) - levelRank(a.level));
}
