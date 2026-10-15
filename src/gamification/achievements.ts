import { getDiscipline, listDisciplines } from "../domain/disciplines.js";
import { weeklyStreak, type GamificationState } from "./engine.js";

export interface Achievement {
  id: string;
  title: string;
  description: string;
  /** Récompense visuelle (badge) ; aucune récompense n'exige de s'entraîner au-delà du plan. */
  badge: { icon: string; tier: "bronze" | "silver" | "gold" };
  disciplineId?: string;
  earned: (s: GamificationState) => boolean;
}

const GENERIC: Achievement[] = [
  { id: "first_session", title: "Premier pas", description: "Terminer une première séance.", badge: { icon: "spark", tier: "bronze" }, earned: (s) => s.sessionsCompleted >= 1 },
  { id: "sessions_10", title: "Lancé", description: "10 séances réalisées.", badge: { icon: "flame", tier: "bronze" }, earned: (s) => s.sessionsCompleted >= 10 },
  { id: "sessions_50", title: "Pilier", description: "50 séances réalisées.", badge: { icon: "flame", tier: "silver" }, earned: (s) => s.sessionsCompleted >= 50 },
  { id: "streak_4", title: "Un mois régulier", description: "4 semaines consécutives à au moins 70 % du plan.", badge: { icon: "calendar", tier: "silver" }, earned: (s) => weeklyStreak(s.weeks) >= 4 },
  { id: "streak_12", title: "Habitude installée", description: "12 semaines régulières.", badge: { icon: "calendar", tier: "gold" }, earned: (s) => weeklyStreak(s.weeks) >= 12 },
  { id: "multisport_3", title: "Polyvalent", description: "Pratiquer 3 disciplines différentes.", badge: { icon: "compass", tier: "silver" }, earned: (s) => s.disciplinesPracticed.length >= 3 },
  { id: "first_record", title: "Mieux qu'hier", description: "Battre un premier record personnel.", badge: { icon: "arrow_up", tier: "bronze" }, earned: (s) => s.personalRecordsCount >= 1 },
  { id: "first_skill", title: "Nouvelle compétence", description: "Valider une compétence de street workout.", badge: { icon: "star", tier: "silver" }, disciplineId: "calisthenics", earned: (s) => s.skillsAchieved.length >= 1 },
  {
    id: "recovery_respected",
    title: "Écoute de soi",
    description: "Faire 4 bilans de récupération les jours de repos.",
    badge: { icon: "moon", tier: "bronze" },
    earned: (s) => s.events.filter((e) => e.reason === "rest_day_check_in").length >= 4,
  },
];

/** Un succès « première séance » est créé pour chaque discipline du catalogue, y compris futures. */
function perDiscipline(): Achievement[] {
  return listDisciplines().map((d) => ({
    id: `first_${d.id}`,
    title: `Découverte : ${d.name}`,
    description: `Première séance de ${getDiscipline(d.id).name}.`,
    badge: { icon: "flag", tier: "bronze" as const },
    disciplineId: d.id,
    earned: (s: GamificationState) => s.disciplinesPracticed.includes(d.id),
  }));
}

export const allAchievements = (): Achievement[] => [...GENERIC, ...perDiscipline()];

export function newAchievements(s: GamificationState): Achievement[] {
  return allAchievements().filter((a) => !s.achievements.includes(a.id) && a.earned(s));
}
