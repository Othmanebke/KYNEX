import type { CoverageLevel } from "@kynex/core";
import { colors } from "./tokens";

/**
 * Libellés honnêtes de la couverture d'une discipline. Source unique :
 * tous les écrans passent par ici, aucune discipline non coachée
 * ne peut être présentée comme « Coachée ».
 * `count` : libellé derrière un nombre (« 1 coachée », « 5 coachées », « 12 en suivi seul »).
 */
export const COVERAGE: Record<CoverageLevel, { label: string; count: [one: string, many: string]; explain: string; color: string }> = {
  full: { label: "Coachée", count: ["Coachée", "Coachées"], explain: "Séances générées pour toi, avec règles de progression.", color: colors.accent },
  beta: { label: "Bêta", count: ["En bêta", "En bêta"], explain: "Séances générées, règles encore en cours de validation.", color: colors.warning },
  tracking_only: { label: "Suivi seul", count: ["En suivi seul", "En suivi seul"], explain: "Tu notes tes séances ; l'app ne les programme pas.", color: colors.muted },
  alpha: { label: "Séance libre", count: ["En séance libre", "En séance libre"], explain: "Séance libre uniquement, sans programme ni métriques dédiées.", color: colors.muted },
};

export const coverageCount = (c: CoverageLevel, n: number): string => COVERAGE[c].count[n > 1 ? 1 : 0];

export const COVERAGE_ORDER: CoverageLevel[] = ["full", "beta", "tracking_only", "alpha"];
