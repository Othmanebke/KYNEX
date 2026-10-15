import type { BaseEquipment, BodyRegion, Environment, Goal, Level, Weekday } from "@kynex/core";

/** Libellés français des référentiels du socle. Une seule source pour toute l'app. */

export const LEVEL_LABEL: Record<Level, string> = {
  beginner: "Débutant",
  intermediate: "Intermédiaire",
  advanced: "Avancé",
};

export const PRIORITY_LABEL: Record<1 | 2 | 3, { label: string; hint: string }> = {
  1: { label: "Principale", hint: "Le plus de séances" },
  2: { label: "Secondaire", hint: "Régulière" },
  3: { label: "Complément", hint: "Quand il reste de la place" },
};

export const GOAL_LABEL: Record<Goal, string> = {
  muscle_gain: "Prendre du muscle",
  weight_gain: "Prendre du poids",
  fat_loss: "Perdre du gras",
  max_strength: "Force maximale",
  cardio_endurance: "Endurance cardio",
  speed: "Vitesse",
  power: "Puissance / explosivité",
  agility: "Agilité",
  mobility: "Mobilité",
  flexibility: "Souplesse",
  general_fitness: "Forme générale",
  event_prep: "Préparer une épreuve",
  health: "Santé",
};

export const ENVIRONMENT_LABEL: Record<Environment, string> = {
  gym: "Salle de sport",
  home_no_equipment: "Maison, sans matériel",
  home_equipped: "Maison, équipée",
  street_workout_park: "Parc de street workout",
  outdoor: "Extérieur (route, parc)",
  track: "Piste d'athlétisme",
  pool: "Piscine",
  sports_field: "Terrain de sport",
  bike: "Vélo",
};

export const EQUIPMENT_LABEL: Record<Exclude<BaseEquipment, "bodyweight">, string> = {
  dumbbells: "Haltères",
  barbell: "Barre olympique",
  squat_rack: "Rack à squat",
  bench: "Banc",
  machines: "Machines guidées",
  cables: "Poulies",
  kettlebell: "Kettlebell",
  resistance_band: "Élastiques",
  pullup_bar: "Barre de traction",
  parallel_bars: "Barres parallèles",
  jump_rope: "Corde à sauter",
  mat: "Tapis",
  bike: "Vélo / home-trainer",
  rower: "Rameur",
};

export const REGION_LABEL: Record<BodyRegion, string> = {
  shoulder: "Épaule",
  elbow: "Coude",
  wrist: "Poignet",
  lower_back: "Bas du dos",
  hip: "Hanche",
  knee: "Genou",
  ankle: "Cheville",
  neck: "Nuque",
};

export const DAY_LABEL: Record<Weekday, { short: string; long: string }> = {
  mon: { short: "Lun", long: "Lundi" },
  tue: { short: "Mar", long: "Mardi" },
  wed: { short: "Mer", long: "Mercredi" },
  thu: { short: "Jeu", long: "Jeudi" },
  fri: { short: "Ven", long: "Vendredi" },
  sat: { short: "Sam", long: "Samedi" },
  sun: { short: "Dim", long: "Dimanche" },
};

/** « 1 h 15 », « 45 min », « 2 h ». */
export function formatMinutes(min: number): string {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h} h ${String(m).padStart(2, "0")}` : `${h} h`;
}
