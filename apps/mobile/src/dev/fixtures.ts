import { BODY_REGIONS, ENVIRONMENTS, GOALS, listDisciplines } from "@kynex/core";
import { EMPTY_DRAFT, type ProfileDraft } from "@/features/onboarding/draft";
import { EQUIPMENT_LABEL } from "@/ui/labels";

/**
 * Jeux de données de développement (break-ui). Jamais utilisés hors __DEV__.
 * Le « pire cas » est réaliste : un vrai format d'e-mail long, un mot de passe
 * juste sous la limite, le message d'erreur le plus long de auth-rules.ts.
 */
export type DataMode = "demo" | "pire" | "vide";

export const AUTH_FIXTURES: Record<DataMode, { email: string; password: string; formError: string | null; submitOnMount: boolean }> = {
  demo: { email: "lea.martin@gmail.com", password: "", formError: null, submitOnMount: false },
  pire: {
    email: "aleksandra.wisniewska-kowalczyk@northwind-industries-holdings.example.com",
    password: "Jo2024!",
    formError: "Confirme d'abord ton e-mail avec le lien reçu, puis reconnecte-toi.",
    submitOnMount: true,
  },
  vide: { email: "", password: "", formError: null, submitOnMount: true },
};

export const USER_FIXTURES: Record<DataMode, { email?: string; id: string }> = {
  demo: { email: "lea.martin@gmail.com", id: "3f2a9c1e-7b4d-4e8a-9c2f-1a6b5d8e0f47" },
  pire: { email: "aleksandra.wisniewska-kowalczyk@northwind-industries-holdings.example.com", id: "3f2a9c1e-7b4d-4e8a-9c2f-1a6b5d8e0f47" },
  vide: { email: undefined, id: "3f2a9c1e-7b4d-4e8a-9c2f-1a6b5d8e0f47" },
};

export function readMode(v: string | string[] | undefined): DataMode | null {
  if (!__DEV__) return null;
  const s = Array.isArray(v) ? v[0] : v;
  return s === "demo" || s === "pire" || s === "vide" ? s : null;
}

export const PROFILE_FIXTURES: Record<DataMode, ProfileDraft> = {
  demo: {
    disciplines: [
      { disciplineId: "strength_training", level: "intermediate", priority: 1 },
      { disciplineId: "running", level: "beginner", priority: 2 },
      { disciplineId: "mobility", level: "beginner", priority: 3 },
    ],
    goals: ["muscle_gain", "cardio_endurance"],
    environments: ["gym", "outdoor"],
    equipment: ["barbell", "dumbbells", "bench", "squat_rack"],
    availability: { mon: 60, tue: 45, thu: 60, sat: 90 },
    preferredRestDays: ["sun"],
    lowImpact: false,
    painRegions: [],
  },
  // Tout coché, valeurs maximales du schéma (durée 240, 6 séances), 6 jours sur 7 en repos.
  pire: {
    disciplines: listDisciplines().map((d, i) => ({ disciplineId: d.id, level: "advanced", priority: (Math.min(3, i + 1) as 1 | 2 | 3), sessionsPerWeek: i === 0 ? 6 : undefined })),
    goals: [...GOALS],
    environments: [...ENVIRONMENTS],
    equipment: Object.keys(EQUIPMENT_LABEL) as ProfileDraft["equipment"],
    availability: { mon: 240, tue: 240, wed: 240, thu: 240, fri: 240, sat: 240, sun: 10 },
    preferredRestDays: ["mon", "tue", "wed", "thu", "fri", "sat"],
    lowImpact: true,
    painRegions: [...BODY_REGIONS],
  },
  vide: EMPTY_DRAFT,
};
