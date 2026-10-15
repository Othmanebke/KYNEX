import { getDiscipline } from "../domain/disciplines.js";
import { calisthenicsGenerator } from "./calisthenics.js";
import { hiitGenerator } from "./hiit.js";
import { hybridGenerator } from "./hybrid.js";
import { mobilityGenerator } from "./mobility.js";
import { runningGenerator } from "./running.js";
import { strengthGenerator } from "./strength.js";
import type { SessionGenerator } from "./types.js";

const generators = new Map<string, SessionGenerator>(
  [strengthGenerator, calisthenicsGenerator, runningGenerator, hiitGenerator, mobilityGenerator, hybridGenerator].map((g) => [g.disciplineId, g]),
);

/** Point d'extension : brancher le générateur d'une nouvelle discipline. */
export function registerGenerator(gen: SessionGenerator): void {
  getDiscipline(gen.disciplineId); // la discipline doit exister au catalogue
  if (generators.has(gen.disciplineId)) throw new Error(`Générateur déjà enregistré : ${gen.disciplineId}`);
  generators.set(gen.disciplineId, gen);
}

export const getGenerator = (disciplineId: string): SessionGenerator | undefined => generators.get(disciplineId);

export const listGenerators = (): SessionGenerator[] => [...generators.values()];
