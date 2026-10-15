import {
  getDiscipline,
  TrainingProfileSchema,
  WEEKDAYS,
  type BaseEquipment,
  type BodyRegion,
  type Environment,
  type Goal,
  type Level,
  type TrainingProfile,
  type TrainingProfileInput,
  type Weekday,
} from "@kynex/core";

/**
 * Brouillon du profil, tel que l'utilisateur le remplit étape par étape.
 * Logique pure (sans React) : validation par étape, puis conversion vers
 * le schéma Zod du socle (`TrainingProfileSchema`), qui reste l'arbitre final.
 */
export interface DraftDiscipline {
  disciplineId: string;
  level: Level;
  priority: 1 | 2 | 3;
  /** undefined = automatique (déduit de la priorité par l'orchestrateur). */
  sessionsPerWeek?: number;
}

export interface ProfileDraft {
  disciplines: DraftDiscipline[];
  goals: Goal[];
  environments: Environment[];
  equipment: Exclude<BaseEquipment, "bodyweight">[];
  /** Minutes disponibles par jour ; jour absent = indisponible. */
  availability: Partial<Record<Weekday, number>>;
  preferredRestDays: Weekday[];
  lowImpact: boolean;
  painRegions: BodyRegion[];
}

export const EMPTY_DRAFT: ProfileDraft = {
  disciplines: [],
  goals: [],
  environments: [],
  equipment: [],
  availability: {},
  preferredRestDays: [],
  lowImpact: false,
  painRegions: [],
};

export const DURATION_MIN = 10;
export const DURATION_MAX = 240;
export const DURATION_STEP = 5;
export const DEFAULT_MINUTES = 45;
export const SESSIONS_MAX = 6;

export type StepId = "disciplines" | "niveaux" | "objectifs" | "lieux" | "materiel" | "semaine" | "contraintes" | "recap";

export const STEPS: { id: StepId; title: string; short: string }[] = [
  { id: "disciplines", title: "Tes disciplines", short: "Disciplines" },
  { id: "niveaux", title: "Niveau et priorité", short: "Niveaux" },
  { id: "objectifs", title: "Tes objectifs", short: "Objectifs" },
  { id: "lieux", title: "Où tu t'entraînes", short: "Lieux" },
  { id: "materiel", title: "Ton matériel", short: "Matériel" },
  { id: "semaine", title: "Ta semaine", short: "Semaine" },
  { id: "contraintes", title: "Contraintes", short: "Contraintes" },
  { id: "recap", title: "Récapitulatif", short: "Récap" },
];

/** Raison pour laquelle on ne peut pas encore passer à l'étape suivante, ou null. */
export function stepBlocker(step: StepId, d: ProfileDraft): string | null {
  switch (step) {
    case "disciplines":
      return d.disciplines.length ? null : "Choisis au moins une discipline.";
    case "objectifs":
      return d.goals.length ? null : "Choisis au moins un objectif.";
    case "lieux":
      return d.environments.length ? null : "Choisis au moins un lieu.";
    case "semaine": {
      const days = availableDays(d);
      if (!days.length) return "Indique au moins un jour où tu peux t'entraîner.";
      if (days.every((x) => d.preferredRestDays.includes(x))) return "Tous tes jours disponibles sont marqués « repos » : garde au moins un jour d'entraînement.";
      return null;
    }
    default:
      return null;
  }
}

export const availableDays = (d: ProfileDraft): Weekday[] => WEEKDAYS.filter((day) => d.availability[day] !== undefined);

export function toProfileInput(userId: string, d: ProfileDraft): TrainingProfileInput {
  return {
    userId,
    disciplines: d.disciplines.map((x) => ({
      disciplineId: x.disciplineId,
      level: x.level,
      priority: x.priority,
      ...(x.sessionsPerWeek !== undefined ? { sessionsPerWeek: x.sessionsPerWeek } : {}),
    })),
    goals: d.goals,
    equipment: d.equipment,
    environments: d.environments,
    availability: availableDays(d).map((day) => ({ day, maxMinutes: d.availability[day] as number })),
    preferredRestDays: d.preferredRestDays,
    constraints: { lowImpact: d.lowImpact, painRegions: d.painRegions, excludedExercises: [] },
  };
}

export type BuildResult = { ok: true; profile: TrainingProfile } | { ok: false; step: StepId; message: string };

/** Valide le brouillon avec le schéma du socle ; renvoie l'étape fautive sinon. */
export function buildProfile(userId: string, d: ProfileDraft): BuildResult {
  for (const s of STEPS) {
    const b = stepBlocker(s.id, d);
    if (b) return { ok: false, step: s.id, message: b };
  }
  const r = TrainingProfileSchema.safeParse(toProfileInput(userId, d));
  if (r.success) return { ok: true, profile: r.data };
  const issue = r.error.issues[0];
  const field = String(issue?.path[0] ?? "");
  const step: StepId =
    field === "disciplines" ? "disciplines" : field === "goals" ? "objectifs" : field === "environments" ? "lieux" : field === "equipment" ? "materiel" : field === "constraints" ? "contraintes" : "semaine";
  return { ok: false, step, message: issue?.message ?? "Profil invalide." };
}

/** Ajoute ou retire une discipline ; une nouvelle reçoit la priorité suivante disponible. */
export function toggleDiscipline(d: ProfileDraft, id: string): ProfileDraft {
  if (d.disciplines.some((x) => x.disciplineId === id)) return { ...d, disciplines: d.disciplines.filter((x) => x.disciplineId !== id) };
  const priority = (Math.min(3, d.disciplines.length + 1) as 1 | 2 | 3);
  return { ...d, disciplines: [...d.disciplines, { disciplineId: id, level: "beginner", priority }] };
}

export function toggleIn<T>(list: T[], v: T): T[] {
  return list.includes(v) ? list.filter((x) => x !== v) : [...list, v];
}

export function clampMinutes(m: number): number {
  return Math.min(DURATION_MAX, Math.max(DURATION_MIN, Math.round(m / DURATION_STEP) * DURATION_STEP));
}

/** Disciplines choisies qui ne seront pas programmées (suivi seul / séance libre). */
export function notCoached(d: ProfileDraft): string[] {
  return d.disciplines.filter((x) => !["full", "beta"].includes(getDiscipline(x.disciplineId).coverage)).map((x) => x.disciplineId);
}

/** Relit un brouillon stocké en ignorant ce qui n'est plus valide (discipline retirée, etc.). */
export function reviveDraft(raw: unknown): ProfileDraft {
  if (!raw || typeof raw !== "object") return EMPTY_DRAFT;
  const r = raw as Partial<ProfileDraft>;
  const arr = <T>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);
  return {
    disciplines: arr<DraftDiscipline>(r.disciplines).filter((x) => {
      try {
        getDiscipline(x.disciplineId);
        return true;
      } catch {
        return false;
      }
    }),
    goals: arr(r.goals),
    environments: arr(r.environments),
    equipment: arr(r.equipment),
    availability: r.availability && typeof r.availability === "object" ? r.availability : {},
    preferredRestDays: arr(r.preferredRestDays),
    lowImpact: r.lowImpact === true,
    painRegions: arr(r.painRegions),
  };
}
