import type { Weekday } from "../domain/enums.js";
import { getGenerator } from "../generators/registry.js";
import { lowerIntensity } from "../generators/types.js";
import { parseProfile, type TrainingProfileInput } from "../profile/schema.js";
import { buildSession, finalize, weekContext } from "./orchestrator.js";
import type { ScheduledSession, WeeklySchedule } from "./types.js";

function clone(s: WeeklySchedule): WeeklySchedule {
  return { ...s, notes: [...s.notes], days: s.days.map((d) => ({ ...d, sessions: [...d.sessions] })) };
}

function locate(s: WeeklySchedule, sessionId: string): { session: ScheduledSession; dayIndex: number } {
  for (const [dayIndex, d] of s.days.entries()) {
    const session = d.sessions.find((x) => x.id === sessionId);
    if (session) return { session, dayIndex };
  }
  throw new Error(`Séance introuvable : ${sessionId}`);
}

/**
 * Déplace une séance (choix de l'utilisateur, toujours permis) : la séance est
 * régénérée pour le temps disponible du nouveau jour et les conflits sont recalculés.
 */
export function moveSession(schedule: WeeklySchedule, sessionId: string, toDay: Weekday, profileInput: TrainingProfileInput): WeeklySchedule {
  const p = parseProfile(profileInput);
  const out = clone(schedule);
  const { session, dayIndex } = locate(out, sessionId);
  const target = out.days.find((d) => d.day === toDay)!;
  out.days[dayIndex]!.sessions = out.days[dayIndex]!.sessions.filter((x) => x.id !== sessionId);
  const ud = p.disciplines.find((d) => d.disciplineId === session.disciplineId)!;
  const used = target.sessions.reduce((s, x) => s + x.plan.estimatedMinutes, 0);
  const duration = Math.max(session.slot.minMinutes, Math.min(session.slot.preferredMinutes, (target.maxMinutes || session.slot.preferredMinutes) - used));
  target.sessions.push(buildSession(p, ud, session.slot, toDay, duration, out.weekIndex, false));
  return finalize(out, p);
}

export function removeSession(schedule: WeeklySchedule, sessionId: string, profileInput: TrainingProfileInput): WeeklySchedule {
  const p = parseProfile(profileInput);
  const out = clone(schedule);
  const { dayIndex } = locate(out, sessionId);
  out.days[dayIndex]!.sessions = out.days[dayIndex]!.sessions.filter((x) => x.id !== sessionId);
  return finalize(out, p);
}

/**
 * Remplace une séance par une version plus légère, en laissant le générateur de la
 * discipline réappliquer ses règles (ex : un fractionné devient un footing facile).
 */
export function downgradeSession(schedule: WeeklySchedule, sessionId: string, profileInput: TrainingProfileInput): WeeklySchedule {
  const p = parseProfile(profileInput);
  const out = clone(schedule);
  const { session, dayIndex } = locate(out, sessionId);
  const ud = p.disciplines.find((d) => d.disciplineId === session.disciplineId)!;
  const override = { intensityCap: lowerIntensity(session.plan.intensity), volumeFactor: 0.8 };
  const gen = getGenerator(session.disciplineId)!;
  const sameDiscipline = out.days.flatMap((d) => d.sessions).filter((s) => s.disciplineId === session.disciplineId && !s.addOn).length;
  const slots = gen.planSlots(Math.max(sameDiscipline, session.slot.index + 1), weekContext(p, ud, out.weekIndex, override));
  const slot = { ...(slots[session.slot.index] ?? session.slot), index: session.slot.index };
  const day = out.days[dayIndex]!;
  const rebuilt = buildSession(p, ud, slot, day.day, Math.min(session.plan.estimatedMinutes, slot.preferredMinutes), out.weekIndex, session.addOn, override);
  day.sessions = day.sessions.map((x) => (x.id === sessionId ? rebuilt : x));
  return finalize(out, p);
}
