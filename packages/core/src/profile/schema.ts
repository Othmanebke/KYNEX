import { z } from "zod";
import { hasDiscipline } from "../domain/disciplines.js";
import {
  BodyRegionSchema,
  EnvironmentSchema,
  EquipmentSchema,
  GoalSchema,
  LevelSchema,
  WEEKDAYS,
  WeekdaySchema,
  type Level,
} from "../domain/enums.js";

export const UserDisciplineSchema = z.object({
  disciplineId: z.string().refine(hasDiscipline, "discipline inconnue"),
  level: LevelSchema,
  /** 1 = priorité principale, 3 = complément. */
  priority: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  /** Nombre de séances souhaité ; sinon déduit de la priorité. */
  sessionsPerWeek: z.number().int().min(1).max(6).optional(),
});
export type UserDiscipline = z.infer<typeof UserDisciplineSchema>;

export const DayAvailabilitySchema = z.object({
  day: WeekdaySchema,
  maxMinutes: z.number().int().min(10).max(240),
});

export const WellnessSchema = z.object({
  fatigue: z.enum(["normal", "elevated", "high"]).default("normal"),
  /** Blessure ou douleur aiguë déclarée : aucune séance intense n'est proposée. */
  injured: z.boolean().default(false),
});
export type Wellness = z.infer<typeof WellnessSchema>;

export const TrainingProfileSchema = z
  .object({
    userId: z.string().min(1),
    disciplines: z.array(UserDisciplineSchema).min(1),
    goals: z.array(GoalSchema).min(1),
    equipment: z.array(EquipmentSchema).default([]),
    environments: z.array(EnvironmentSchema).min(1),
    availability: z.array(DayAvailabilitySchema).min(1),
    preferredRestDays: z.array(WeekdaySchema).default([]),
    constraints: z
      .object({
        lowImpact: z.boolean().default(false),
        painRegions: z.array(BodyRegionSchema).default([]),
        excludedExercises: z.array(z.string()).default([]),
      })
      .default({ lowImpact: false, painRegions: [], excludedExercises: [] }),
    wellness: WellnessSchema.default({ fatigue: "normal", injured: false }),
  })
  .superRefine((p, ctx) => {
    const ids = p.disciplines.map((x) => x.disciplineId);
    if (new Set(ids).size !== ids.length) ctx.addIssue({ code: "custom", message: "discipline en double", path: ["disciplines"] });
    const days = p.availability.map((x) => x.day);
    if (new Set(days).size !== days.length) ctx.addIssue({ code: "custom", message: "jour en double", path: ["availability"] });
  });

export type TrainingProfile = z.infer<typeof TrainingProfileSchema>;
export type TrainingProfileInput = z.input<typeof TrainingProfileSchema>;

export function parseProfile(input: TrainingProfileInput): TrainingProfile {
  return TrainingProfileSchema.parse(input);
}

const LEVEL_RANK: Record<Level, number> = { beginner: 0, intermediate: 1, advanced: 2 };
export const levelRank = (l: Level): number => LEVEL_RANK[l];

export function sortWeekdays<T extends { day: (typeof WEEKDAYS)[number] }>(items: T[]): T[] {
  return [...items].sort((a, b) => WEEKDAYS.indexOf(a.day) - WEEKDAYS.indexOf(b.day));
}
