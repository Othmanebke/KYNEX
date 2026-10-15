import { getDiscipline, hasDiscipline } from "../domain/disciplines.js";
import { whyInfeasible, type AvailabilityContext } from "../exercises/filter.js";
import { findExercise } from "../exercises/library.js";
import { blockExerciseIds, SessionPlanSchema, type Block, type SessionPlan } from "./schema.js";

export interface ValidationIssue {
  severity: "error" | "warning";
  blockIndex?: number;
  code:
    | "schema"
    | "unknown_discipline"
    | "block_not_allowed"
    | "unknown_exercise"
    | "exercise_discipline_mismatch"
    | "measure_not_supported"
    | "infeasible_exercise"
    | "missing_main_block";
  message: string;
}

const STRUCTURAL = new Set<Block["kind"]>(["warmup", "mobility", "cooldown", "rest", "technique"]);

/**
 * Valide une séance : schéma, formats de blocs autorisés par la discipline,
 * cohérence exercice ↔ discipline ↔ mesure, et (si fourni) faisabilité matérielle.
 */
export function validateSession(input: unknown, ctx?: AvailabilityContext): ValidationIssue[] {
  const parsed = SessionPlanSchema.safeParse(input);
  if (!parsed.success) {
    return parsed.error.issues.map((i) => ({ severity: "error", code: "schema", message: `${i.path.join(".")}: ${i.message}` }));
  }
  const session: SessionPlan = parsed.data;
  const issues: ValidationIssue[] = [];
  if (!hasDiscipline(session.disciplineId)) {
    return [{ severity: "error", code: "unknown_discipline", message: `Discipline inconnue : ${session.disciplineId}` }];
  }
  const discipline = getDiscipline(session.disciplineId);

  if (session.blocks.every((b) => STRUCTURAL.has(b.kind)) && session.disciplineId !== "mobility") {
    issues.push({ severity: "warning", code: "missing_main_block", message: "La séance ne contient que des blocs d'échauffement/retour au calme." });
  }

  session.blocks.forEach((block, blockIndex) => {
    if (!discipline.allowedBlocks.includes(block.kind)) {
      issues.push({ severity: "error", blockIndex, code: "block_not_allowed", message: `Le format « ${block.kind} » n'est pas valide en ${discipline.name}.` });
    }
    for (const exId of blockExerciseIds(block)) {
      const ex = findExercise(exId);
      if (!ex) {
        issues.push({ severity: "error", blockIndex, code: "unknown_exercise", message: `Exercice inconnu : ${exId}` });
        continue;
      }
      // Les blocs structurels peuvent emprunter des exercices de mobilité.
      const allowedDisciplines = STRUCTURAL.has(block.kind) ? [session.disciplineId, "mobility"] : [session.disciplineId];
      if (!ex.disciplines.some((d) => allowedDisciplines.includes(d))) {
        issues.push({ severity: "error", blockIndex, code: "exercise_discipline_mismatch", message: `${ex.name} n'appartient pas à ${discipline.name}.` });
      }
      if (block.kind === "loaded_sets" && !ex.progressionMeasures.includes("load_kg")) {
        issues.push({ severity: "error", blockIndex, code: "measure_not_supported", message: `${ex.name} ne se programme pas avec une charge.` });
      }
      if ((block.kind === "distance" || (block.kind === "intervals" && block.workDistanceM)) && !ex.progressionMeasures.includes("distance_m")) {
        issues.push({ severity: "error", blockIndex, code: "measure_not_supported", message: `${ex.name} ne se mesure pas en distance.` });
      }
      if (block.kind === "circuit" || block.kind === "emom" || block.kind === "amrap") {
        for (const m of block.movements.filter((x) => x.exerciseId === exId)) {
          if (m.distanceM !== undefined && !ex.progressionMeasures.includes("distance_m")) {
            issues.push({ severity: "error", blockIndex, code: "measure_not_supported", message: `${ex.name} ne se mesure pas en distance.` });
          }
          if (m.load !== undefined && !ex.progressionMeasures.includes("load_kg")) {
            issues.push({ severity: "error", blockIndex, code: "measure_not_supported", message: `${ex.name} ne se programme pas avec une charge.` });
          }
        }
      }
      if (ctx) {
        const reasons = whyInfeasible(ex, ctx);
        if (reasons.length) {
          issues.push({ severity: "error", blockIndex, code: "infeasible_exercise", message: `${ex.name} irréalisable (${reasons.join(", ")}).` });
        }
      }
    }
  });
  return issues;
}

export const hasErrors = (issues: ValidationIssue[]): boolean => issues.some((i) => i.severity === "error");
