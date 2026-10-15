import { z } from "zod";
import { BodyRegionSchema, WeekdaySchema, WEEKDAYS, type Weekday } from "../domain/enums.js";
import { getGenerator } from "../generators/registry.js";
import { parseProfile, type TrainingProfile, type TrainingProfileInput, type UserDiscipline } from "../profile/schema.js";
import { buildSession, finalize, weekContext } from "./orchestrator.js";
import { isHeavyLegs } from "./interference.js";
import { traitsOf } from "./conflicts.js";
import type { ScheduledSession, WeeklySchedule } from "./types.js";

export const WellnessSignalSchema = z.object({
  day: WeekdaySchema,
  kind: z.enum(["fatigue", "pain"]),
  severity: z.enum(["moderate", "severe"]),
  /** Zone douloureuse, si la douleur est localisée. */
  region: BodyRegionSchema.optional(),
});
export type WellnessSignal = z.infer<typeof WellnessSignalSchema>;

const REGION_LOAD: Partial<Record<z.infer<typeof BodyRegionSchema>, "lowerBody" | "upperBody">> = {
  knee: "lowerBody", ankle: "lowerBody", hip: "lowerBody", lower_back: "lowerBody",
  shoulder: "upperBody", elbow: "upperBody", wrist: "upperBody",
};

/** La séance sollicite-t-elle la zone signalée ? (charge régionale ou exercices qui la stressent) */
function stressesRegion(s: ScheduledSession, region: WellnessSignal["region"]): boolean {
  if (!region) return true;
  const load = REGION_LOAD[region];
  return (load !== undefined && s.plan.load[load] >= 1) || s.plan.load.impact >= 2;
}

/** Mobilité qui épargne la zone signalée : jambes douloureuses → haut du corps, et inversement. */
function recoveryFocus(signal: WellnessSignal, fallback: string): string {
  const load = signal.region ? REGION_LOAD[signal.region] : undefined;
  return load === "upperBody" ? "hips_legs" : load === "lowerBody" ? "shoulders_spine" : fallback;
}

/**
 * Applique un signalement de fatigue ou de douleur au calendrier, sans pénalité :
 * - sévère : les séances du jour deviennent du repos, les séances intenses du lendemain sont allégées ;
 * - modéré : les séances exigeantes du jour (ou celles sollicitant la zone douloureuse)
 *   sont remplacées par une mobilité douce qui évite cette zone ; à défaut, repos.
 * Les séances remplacées ne comptent plus comme « prévues » pour la régularité.
 */
export function applyWellnessSignal(schedule: WeeklySchedule, signalInput: WellnessSignal, profileInput: TrainingProfileInput): WeeklySchedule {
  const signal = WellnessSignalSchema.parse(signalInput);
  const base = parseProfile(profileInput);
  // Profil temporaire : la zone douloureuse est exclue de toute génération de remplacement.
  const p: TrainingProfile = signal.region
    ? { ...base, constraints: { ...base.constraints, painRegions: [...new Set([...base.constraints.painRegions, signal.region])] } }
    : base;
  const out: WeeklySchedule = { ...schedule, notes: [...schedule.notes], days: schedule.days.map((d) => ({ ...d, sessions: [...d.sessions] })) };
  const today = out.days.find((d) => d.day === signal.day)!;
  const reason = `${signal.kind === "pain" ? "Douleur" : "Fatigue"} ${signal.severity === "severe" ? "importante" : "modérée"} signalée${signal.region ? ` (${signal.region})` : ""}`;

  const mobilityUd: UserDiscipline = p.disciplines.find((d) => d.disciplineId === "mobility") ?? { disciplineId: "mobility", level: "beginner", priority: 3 };

  const replacements: ScheduledSession[] = [];
  for (const s of today.sessions) {
    if (s.substitution) {
      replacements.push(s);
      continue;
    }
    const demanding = s.plan.intensity === "high" || s.plan.intensity === "moderate";
    const concerned = signal.kind === "pain" ? stressesRegion(s, signal.region) : demanding || signal.severity === "severe";
    if (!concerned) {
      replacements.push(s);
      continue;
    }
    if (signal.severity === "severe" || s.disciplineId === "mobility") {
      out.notes.push(`${reason} : « ${s.plan.title} » remplacée par du repos.`);
      continue;
    }
    try {
      const slot = getGenerator("mobility")!.planSlots(1, weekContext(p, mobilityUd, out.weekIndex, { intensityCap: "low" }))[0]!;
      const rebuilt = buildSession(p, mobilityUd, { ...slot, index: 90 + s.slot.index, variant: recoveryFocus(signal, slot.variant) }, today.day, 20, out.weekIndex, false);
      replacements.push({ ...rebuilt, id: `${s.id}~recovery`, substitution: { reason, replacedSessionId: s.id, replacedTitle: s.plan.title } });
      out.notes.push(`${reason} : « ${s.plan.title} » remplacée par une mobilité douce.`);
    } catch {
      out.notes.push(`${reason} : « ${s.plan.title} » remplacée par du repos.`);
    }
  }
  today.sessions = replacements;

  if (signal.severity === "severe") {
    const tomorrow = out.days[(WEEKDAYS.indexOf(signal.day as Weekday) + 1) % 7]!;
    for (const s of tomorrow.sessions) {
      if (s.plan.intensity === "high" || isHeavyLegs(traitsOf(s))) {
        const ud = p.disciplines.find((d) => d.disciplineId === s.disciplineId);
        if (!ud) continue;
        const override = { intensityCap: "moderate" as const, volumeFactor: 0.7 };
        const slots = getGenerator(s.disciplineId)!.planSlots(s.slot.index + 1, weekContext(p, ud, out.weekIndex, override));
        const rebuilt = buildSession(p, ud, { ...(slots[s.slot.index] ?? s.slot), index: s.slot.index }, tomorrow.day, s.plan.estimatedMinutes, out.weekIndex, s.addOn, override);
        tomorrow.sessions = tomorrow.sessions.map((x) => (x.id === s.id ? { ...rebuilt, substitution: { reason: `${reason} la veille`, replacedSessionId: s.id, replacedTitle: s.plan.title } } : x));
      }
    }
  }
  return finalize(out, base);
}

/** Séances qui comptent pour la régularité : les remplacements pour raison de santé n'en font pas partie. */
export function plannedForStreak(schedule: WeeklySchedule): number {
  return schedule.days.flatMap((d) => d.sessions).filter((s) => !s.substitution && !s.addOn).length;
}
