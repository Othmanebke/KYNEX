import { findExercise, getDiscipline, parseProfile, planWeek, WEEKDAYS, type SessionResultInput, type TrainingProfile } from "@kynex/core";
import { dateOfDay, isoDate, mondayOf } from "@/features/week/week";
import { emptyJournal, saveManualSession, saveRestCheckIn, type Journal } from "./journal-core";

/**
 * Compte de démonstration : données FICTIVES, générées en faisant tourner le vrai socle
 * (planification, records, XP) sur 4 semaines passées. Toujours étiqueté « Démo » à l'écran,
 * jamais mélangé avec les données d'un vrai compte.
 */
export const DEMO_USER_ID = "demo";
const WEEKS_BACK = 4;

/** Générateur pseudo-aléatoire déterministe (la démo est identique à chaque ouverture). */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

/** Charges de départ fictives (kg) pour la démo ; progression de 2,5 kg toutes les 2 semaines. */
const BASE_KG: Record<string, number> = {
  back_squat: 70, bench_press: 55, barbell_row: 50, overhead_press: 35, deadlift: 85, romanian_deadlift: 60,
  goblet_squat: 20, dumbbell_bench_press: 20, one_arm_dumbbell_row: 22, dumbbell_shoulder_press: 14,
  hip_thrust: 70, kettlebell_swing: 16, walking_lunge: 12, leg_press: 110, lat_pulldown: 45, seated_cable_row: 45,
};

export const demoProfile = (): TrainingProfile =>
  parseProfile({
    userId: DEMO_USER_ID,
    disciplines: [
      { disciplineId: "strength_training", level: "intermediate", priority: 1 },
      { disciplineId: "running", level: "intermediate", priority: 2 },
      { disciplineId: "mobility", level: "beginner", priority: 3 },
      { disciplineId: "swimming", level: "beginner", priority: 3 },
    ],
    goals: ["muscle_gain", "cardio_endurance", "mobility"],
    equipment: ["barbell", "dumbbells", "bench", "squat_rack", "cables", "machines", "pullup_bar", "kettlebell", "mat"],
    environments: ["gym", "outdoor", "home_no_equipment", "pool"],
    availability: [
      { day: "mon", maxMinutes: 75 },
      { day: "tue", maxMinutes: 60 },
      { day: "thu", maxMinutes: 75 },
      { day: "sat", maxMinutes: 90 },
      { day: "sun", maxMinutes: 60 },
    ],
    preferredRestDays: ["wed"],
  });

export interface DemoData {
  profile: TrainingProfile;
  journal: Journal;
  planStart: string;
}

export function buildDemo(now: Date): DemoData {
  const profile = demoProfile();
  const rand = rng(42);
  const thisMonday = mondayOf(now);
  const start = new Date(thisMonday.getFullYear(), thisMonday.getMonth(), thisMonday.getDate() - 7 * WEEKS_BACK);
  let journal = emptyJournal(DEMO_USER_ID);
  let n = 0;

  for (let w = 0; w <= WEEKS_BACK; w++) {
    const monday = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 7 * w);
    const schedule = planWeek(profile, { weekIndex: w });
    const weekStart = isoDate(monday);
    const current = w === WEEKS_BACK;

    for (const day of schedule.days) {
      const date = dateOfDay(monday, day.day);
      if (date >= new Date(now.getFullYear(), now.getMonth(), now.getDate())) continue; // pas de séance « future »
      if (!day.sessions.length && rand() < 0.5) journal = saveRestCheckIn(journal, isoDate(date)).journal;
      for (const s of day.sessions) {
        if (s.addOn || rand() < (current ? 0.1 : 0.15)) continue; // quelques séances manquées, comme dans la vraie vie
        const d = getDiscipline(s.disciplineId);
        const durationSec = Math.round(s.plan.estimatedMinutes * 60 * (0.92 + rand() * 0.16));
        const startedAt = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 18, 30).toISOString();
        let metrics: SessionResultInput["metrics"];
        if (d.metricModel === "resistance") {
          const exercises = s.plan.blocks.flatMap((b) => {
            if (b.kind !== "loaded_sets" && b.kind !== "sets_reps") return [];
            const reps = typeof b.reps === "number" ? b.reps : Math.round((b.reps.min + b.reps.max) / 2);
            const base = BASE_KG[b.exerciseId];
            const kg = base !== undefined ? base + 2.5 * Math.floor(w / 2) : undefined;
            const rpe = b.kind === "loaded_sets" && b.load.type === "rpe" ? b.load.rpe : b.targetRpe;
            return [{ exerciseId: b.exerciseId, sets: Array.from({ length: b.sets }, () => ({ reps, ...(kg !== undefined && b.kind === "loaded_sets" ? { loadKg: kg } : {}), ...(rpe ? { rpe } : {}) })) }];
          });
          metrics = exercises.length ? { model: "resistance", exercises } : undefined;
        } else if (d.metricModel === "endurance") {
          const pace = 370 - w * 4 + Math.round(rand() * 20); // s/km, légère progression
          metrics = { model: "endurance", durationSec, distanceM: Math.round((durationSec / pace) * 1000), source: "manual" };
        } else if (d.metricModel === "practice") {
          const practices = [...new Set(s.plan.blocks.flatMap((b) => ("items" in b ? b.items.map((i) => i.exerciseId) : [])))].filter((id) => findExercise(id));
          metrics = practices.length ? { model: "practice", durationSec, practices, zones: [] } : undefined;
        }
        journal = saveManualSession(
          journal,
          {
            id: `demo-${n++}`,
            userId: DEMO_USER_ID,
            disciplineId: s.disciplineId,
            plannedSessionId: s.id,
            date: isoDate(date),
            startedAt,
            status: "completed",
            durationSec,
            perceivedEffort: s.plan.intensity === "high" ? 8 : s.plan.intensity === "moderate" ? 6 : 4,
            ...(metrics ? { metrics } : {}),
          },
          { schedule, weekStart },
        ).journal;
      }
    }
    // Natation (suivi seul) notée à la main une semaine sur deux, sans mesure inventée au-delà de la durée.
    if (w % 2 === 1) {
      const date = dateOfDay(monday, WEEKDAYS[6]);
      if (date < now) journal = saveManualSession(journal, { id: `demo-${n++}`, userId: DEMO_USER_ID, disciplineId: "swimming", date: isoDate(date), status: "completed", durationSec: 1800 }, { schedule, weekStart }).journal;
    }
  }
  return { profile, journal, planStart: isoDate(start) };
}
