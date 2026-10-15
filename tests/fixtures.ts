import type { TrainingProfileInput } from "../src/profile/schema.js";

export const gymProfile = (over: Partial<TrainingProfileInput> = {}): TrainingProfileInput => ({
  userId: "u1",
  disciplines: [
    { disciplineId: "strength_training", level: "intermediate", priority: 1 },
    { disciplineId: "running", level: "intermediate", priority: 2 },
    { disciplineId: "mobility", level: "beginner", priority: 3 },
  ],
  goals: ["muscle_gain", "cardio_endurance"],
  equipment: ["barbell", "dumbbells", "bench", "squat_rack", "cables", "machines", "pullup_bar", "kettlebell", "mat"],
  environments: ["gym", "outdoor", "home_no_equipment"],
  availability: [
    { day: "mon", maxMinutes: 75 },
    { day: "tue", maxMinutes: 60 },
    { day: "wed", maxMinutes: 60 },
    { day: "thu", maxMinutes: 75 },
    { day: "sat", maxMinutes: 120 },
    { day: "sun", maxMinutes: 90 },
  ],
  preferredRestDays: ["fri"],
  ...over,
});

export const homeNoEquipment = (over: Partial<TrainingProfileInput> = {}): TrainingProfileInput => ({
  userId: "u2",
  disciplines: [
    { disciplineId: "hiit", level: "beginner", priority: 1 },
    { disciplineId: "calisthenics", level: "beginner", priority: 2 },
    { disciplineId: "mobility", level: "beginner", priority: 3 },
  ],
  goals: ["fat_loss", "general_fitness"],
  equipment: [],
  environments: ["home_no_equipment"],
  availability: [
    { day: "mon", maxMinutes: 30 },
    { day: "wed", maxMinutes: 30 },
    { day: "fri", maxMinutes: 30 },
    { day: "sun", maxMinutes: 45 },
  ],
  ...over,
});

export const parkProfile = (over: Partial<TrainingProfileInput> = {}): TrainingProfileInput => ({
  userId: "u3",
  disciplines: [{ disciplineId: "calisthenics", level: "advanced", priority: 1, sessionsPerWeek: 3 }],
  goals: ["max_strength"],
  equipment: ["pullup_bar", "parallel_bars"],
  environments: ["street_workout_park", "outdoor"],
  availability: [
    { day: "mon", maxMinutes: 75 },
    { day: "wed", maxMinutes: 75 },
    { day: "fri", maxMinutes: 75 },
  ],
  ...over,
});
