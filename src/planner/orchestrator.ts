import { validateSession } from "../blocks/validate.js";
import { getDiscipline } from "../domain/disciplines.js";
import { GENERATABLE_COVERAGE, WEEKDAYS, type Intensity, type Level, type Weekday } from "../domain/enums.js";
import { contextFromProfile } from "../exercises/filter.js";
import { getGenerator } from "../generators/registry.js";
import { intensityRank, type SlotSpec, type WeekContext } from "../generators/types.js";
import { levelRank, parseProfile, type TrainingProfile, type TrainingProfileInput, type UserDiscipline } from "../profile/schema.js";
import { detectConflicts, MAX_HIGH_PER_WEEK, withSuggestions, type ConflictContext } from "./conflicts.js";
import { violationsBetween, WEEKLY_CNS_BUDGET, type SessionTraits } from "./interference.js";
import type { DayPlan, ScheduledSession, WeeklySchedule } from "./types.js";

const DEFAULT_SESSIONS: Record<1 | 2 | 3, number> = { 1: 3, 2: 2, 3: 1 };
/** Plafond de séances principales par semaine, selon le niveau le plus élevé déclaré. */
const MAX_MAIN_SESSIONS: Record<Level, number> = { beginner: 4, intermediate: 5, advanced: 6 };
const ADD_ON_MINUTES = 15;

export interface WellnessAdjustment {
  intensityCap: Intensity;
  volumeFactor: number;
  recoveryOnly: boolean;
}

/** L'état de forme déclaré prime sur le programme : jamais d'incitation à forcer. */
export function wellnessAdjustment(p: TrainingProfile): WellnessAdjustment {
  if (p.wellness.injured) return { intensityCap: "low", volumeFactor: 0.6, recoveryOnly: true };
  if (p.wellness.fatigue === "high") return { intensityCap: "low", volumeFactor: 0.6, recoveryOnly: false };
  if (p.wellness.fatigue === "elevated") return { intensityCap: "moderate", volumeFactor: 0.8, recoveryOnly: false };
  return { intensityCap: "high", volumeFactor: 1, recoveryOnly: false };
}

export function weekContext(p: TrainingProfile, ud: UserDiscipline, weekIndex: number, override?: Partial<WellnessAdjustment>): WeekContext {
  const w = { ...wellnessAdjustment(p), ...override };
  return { profile: p, discipline: ud, availability: contextFromProfile(p), weekIndex, intensityCap: w.intensityCap, volumeFactor: w.volumeFactor };
}

export function conflictContext(p: TrainingProfile): ConflictContext {
  const level = p.disciplines.reduce<Level>((best, d) => (levelRank(d.level) > levelRank(best) ? d.level : best), "beginner");
  return { level, wellness: p.wellness };
}

const dayIdx = (d: Weekday) => WEEKDAYS.indexOf(d);
const circularDistance = (a: Weekday, b: Weekday) => {
  const x = Math.abs(dayIdx(a) - dayIdx(b));
  return Math.min(x, 7 - x);
};

interface Reservation {
  slot: SlotSpec;
  ud: UserDiscipline;
  addOn: boolean;
}

const slotTraits = (s: SlotSpec): SessionTraits => ({ disciplineId: s.disciplineId, variant: s.variant, intensity: s.intensity, load: s.load });

/**
 * Coût de placement d'un créneau un jour donné. Les interférences utilisent exactement
 * les règles de détection (`INTERFERENCE_RULES`), pondérées par leur gravité, pour que
 * l'orchestrateur évite d'emblée ce que la détection signalerait.
 */
function placementPenalty(day: Weekday, slot: SlotSpec, open: Map<Weekday, { available: boolean; maxMinutes: number }>, booked: Map<Weekday, Reservation[]>): number {
  const info = open.get(day)!;
  if (!info.available || booked.get(day)!.some((r) => !r.addOn) || info.maxMinutes < slot.minMinutes) return Infinity;
  let penalty = dayIdx(day) * 0.01;
  for (const [d, rs] of booked) {
    for (const r of rs) {
      if (r.addOn) continue;
      for (const v of violationsBetween({ day, traits: slotTraits(slot) }, { day: d, traits: slotTraits(r.slot) })) penalty += v.rule.placementPenalty;
      // Étaler les séances d'une même discipline dans la semaine.
      if (r.slot.disciplineId === slot.disciplineId) penalty += 3 / Math.max(1, circularDistance(d, day));
    }
  }
  if (info.maxMinutes < slot.preferredMinutes) penalty += (slot.preferredMinutes - info.maxMinutes) / 10;
  return penalty;
}

/** Coût total d'une semaine : somme des coûts de placement de chaque séance vis-à-vis des autres. */
function weekCost(open: Map<Weekday, { available: boolean; maxMinutes: number }>, booked: Map<Weekday, Reservation[]>): number {
  let total = 0;
  for (const [day, rs] of booked) {
    for (const r of rs) {
      if (r.addOn) continue;
      // Évalue la séance comme si elle était seule ce jour-là.
      const others = new Map([...booked].map(([d, xs]) => [d, xs.filter((x) => x !== r)]));
      total += placementPenalty(day, r.slot, open, others);
    }
  }
  return total;
}

/**
 * Le placement glouton (priorités d'abord) peut se bloquer : la discipline principale, placée
 * en premier, ignore les suivantes. Amélioration locale : on essaie de déplacer chaque séance
 * vers un jour libre ou de l'échanger avec une autre, et on garde tout changement qui réduit
 * le coût total. Converge en quelques passes (7 jours au plus).
 */
function improvePlacement(open: Map<Weekday, { available: boolean; maxMinutes: number }>, booked: Map<Weekday, Reservation[]>): void {
  const mainOf = (d: Weekday) => booked.get(d)!.find((r) => !r.addOn);
  let cost = weekCost(open, booked);
  for (let pass = 0; pass < 10; pass++) {
    let improved = false;
    for (const from of WEEKDAYS) {
      const r = mainOf(from);
      if (!r) continue;
      for (const to of WEEKDAYS) {
        if (to === from || !open.get(to)!.available) continue;
        const other = mainOf(to);
        if (open.get(to)!.maxMinutes < r.slot.minMinutes) continue;
        if (other && open.get(from)!.maxMinutes < other.slot.minMinutes) continue;
        // Applique le déplacement / l'échange.
        booked.set(from, booked.get(from)!.filter((x) => x !== r).concat(other ? [other] : []));
        booked.set(to, booked.get(to)!.filter((x) => x !== other).concat([r]));
        const next = weekCost(open, booked);
        if (next < cost - 1e-6) {
          cost = next;
          improved = true;
          break;
        }
        // Annule.
        booked.set(to, booked.get(to)!.filter((x) => x !== r).concat(other ? [other] : []));
        booked.set(from, booked.get(from)!.filter((x) => x !== other).concat([r]));
      }
    }
    if (!improved) break;
  }
}

/** Ramène le nombre total de séances principales sous le plafond, en réduisant d'abord les priorités basses. */
function fitSessionCounts(requested: Array<{ ud: UserDiscipline; count: number }>, max: number, notes: string[]) {
  const counts = requested.map((r) => ({ ...r }));
  const total = () => counts.reduce((s, c) => s + c.count, 0);
  while (total() > max) {
    const byLowPriority = [...counts].filter((c) => c.count > 0).sort((a, b) => b.ud.priority - a.ud.priority || b.count - a.count);
    const reducible = byLowPriority.find((c) => c.count > 1) ?? byLowPriority[0]!;
    reducible.count -= 1;
    if (reducible.count === 0) notes.push(`${getDiscipline(reducible.ud.disciplineId).name} non programmée cette semaine : pas assez de créneaux disponibles.`);
  }
  for (const c of counts) {
    const before = requested.find((r) => r.ud === c.ud)!.count;
    if (c.count > 0 && c.count < before) notes.push(`${getDiscipline(c.ud.disciplineId).name} : ${c.count} séance(s) au lieu de ${before} pour respecter vos disponibilités et la récupération.`);
  }
  return counts.filter((c) => c.count > 0);
}

export function buildSession(p: TrainingProfile, ud: UserDiscipline, slot: SlotSpec, day: Weekday, durationMin: number, weekIndex: number, addOn: boolean, override?: Partial<WellnessAdjustment>): ScheduledSession {
  const gen = getGenerator(slot.disciplineId)!;
  const ctx = weekContext(p, ud, weekIndex, override);
  const id = `w${weekIndex}-${slot.disciplineId}-${slot.index}`;
  const plan = gen.generate({ ...ctx, slot, sessionId: id, durationMin });
  return { id, day, disciplineId: slot.disciplineId, priority: ud.priority, slot, plan, addOn, issues: validateSession(plan, ctx.availability) };
}

export function refreshStatuses(days: DayPlan[]): void {
  for (const d of days) {
    if (!d.sessions.length) d.status = "rest";
    else if (d.sessions.every((s) => s.disciplineId === "mobility")) d.status = "active_recovery";
    else d.status = "training";
  }
}

/** Recalcule conflits et suggestions après toute modification du calendrier. */
export function finalize(schedule: WeeklySchedule, p: TrainingProfile): WeeklySchedule {
  refreshStatuses(schedule.days);
  const ctx = conflictContext(p);
  const conflicts = detectConflicts(schedule, ctx);
  schedule.conflicts = withSuggestions(schedule, conflicts, ctx, (id, to) => dryMove(schedule, id, to));
  return schedule;
}

/** Déplacement « à sec » (sans régénération) utilisé pour évaluer les suggestions. */
export function dryMove(schedule: WeeklySchedule, sessionId: string, toDay: Weekday): WeeklySchedule {
  const days = schedule.days.map((d) => ({ ...d, sessions: [...d.sessions] }));
  const from = days.find((d) => d.sessions.some((s) => s.id === sessionId));
  const to = days.find((d) => d.day === toDay);
  if (!from || !to) return schedule;
  const s = from.sessions.find((x) => x.id === sessionId)!;
  from.sessions = from.sessions.filter((x) => x.id !== sessionId);
  to.sessions.push({ ...s, day: toDay, addOn: false });
  return { ...schedule, days, conflicts: [] };
}

/**
 * Construit une semaine multisports réaliste :
 * 1. adapte selon l'état de forme ; 2. fixe le nombre de séances par discipline (priorités,
 * disponibilités, plafond de volume) ; 3. laisse chaque générateur définir ses créneaux ;
 * 4. place les créneaux en espaçant les séances exigeantes ; 5. greffe la mobilité ;
 * 6. génère, valide et signale les conflits avec des alternatives.
 */
export function planWeek(input: TrainingProfileInput, opts: { weekIndex?: number } = {}): WeeklySchedule {
  const p = parseProfile(input);
  const weekIndex = opts.weekIndex ?? 0;
  const notes: string[] = [];
  const w = wellnessAdjustment(p);

  const open = new Map(
    WEEKDAYS.map((day) => {
      const a = p.availability.find((x) => x.day === day);
      // Un jour de repos préféré reste un jour de repos, même s'il est déclaré disponible.
      return [day, { available: !!a && !p.preferredRestDays.includes(day), maxMinutes: a?.maxMinutes ?? 0 }] as const;
    }),
  );
  const booked = new Map<Weekday, Reservation[]>(WEEKDAYS.map((d) => [d, []]));
  const trainingDays = WEEKDAYS.filter((d) => open.get(d)!.available);

  const generatable: UserDiscipline[] = [];
  for (const ud of p.disciplines) {
    const def = getDiscipline(ud.disciplineId);
    if (GENERATABLE_COVERAGE.includes(def.coverage) && getGenerator(ud.disciplineId)) {
      generatable.push(ud);
      if (def.coverage === "beta") notes.push(`${def.name} : version bêta, règles de programmation en cours de validation.`);
    } else {
      notes.push(`${def.name} : ${def.coverage === "tracking_only" ? "suivi manuel disponible, génération automatique pas encore proposée" : "discipline en alpha, séance libre uniquement"}.`);
    }
  }
  if (w.recoveryOnly) {
    notes.push("Blessure déclarée : uniquement de la mobilité douce, à adapter avec un professionnel de santé. Aucune séance intense n'est proposée.");
  }

  const mobility = generatable.find((d) => d.disciplineId === "mobility");
  const mainDisciplines = w.recoveryOnly ? [] : generatable.filter((d) => d.disciplineId !== "mobility");
  const maxMain = Math.min(trainingDays.length, 6, MAX_MAIN_SESSIONS[conflictContext(p).level]);
  const counts = fitSessionCounts(
    mainDisciplines.map((ud) => ({ ud, count: ud.sessionsPerWeek ?? DEFAULT_SESSIONS[ud.priority] })),
    maxMain,
    notes,
  );

  // Volume global : au-delà du plafond de séances intenses ou du budget SNC hebdomadaire,
  // les disciplines les moins prioritaires passent en variantes modérées (leur générateur
  // applique ses propres règles : un fractionné devient un footing, pas un « fractionné doux »).
  const perDiscipline = counts.map(({ ud, count }) => ({ ud, count, slots: getGenerator(ud.disciplineId)!.planSlots(count, weekContext(p, ud, weekIndex)) }));
  const level = conflictContext(p).level;
  const highCount = () => perDiscipline.reduce((n, d) => n + d.slots.filter((s) => s.intensity === "high").length, 0);
  const cnsTotal = () => perDiscipline.reduce((n, d) => n + d.slots.reduce((m, s) => m + s.load.cns, 0), 0);
  const withinBudget = () => highCount() <= MAX_HIGH_PER_WEEK[level] && cnsTotal() <= WEEKLY_CNS_BUDGET[level];
  for (const d of [...perDiscipline].sort((a, b) => b.ud.priority - a.ud.priority)) {
    if (withinBudget()) break;
    if (!d.slots.some((s) => s.intensity === "high")) continue;
    d.slots = getGenerator(d.ud.disciplineId)!.planSlots(d.count, weekContext(p, d.ud, weekIndex, { intensityCap: "moderate" }));
    notes.push(`${getDiscipline(d.ud.disciplineId).name} : séances intenses remplacées par des variantes modérées pour préserver la récupération globale.`);
  }
  const mainSlots = perDiscipline.flatMap(({ ud, slots }) => slots.map((slot) => ({ slot, ud, addOn: false })));
  mainSlots.sort(
    (a, b) => a.ud.priority - b.ud.priority || intensityRank(b.slot.intensity) - intensityRank(a.slot.intensity) || b.slot.preferredMinutes - a.slot.preferredMinutes,
  );

  for (const r of mainSlots) {
    let best: Weekday | undefined;
    let bestScore = Infinity;
    for (const d of WEEKDAYS) {
      const score = placementPenalty(d, r.slot, open, booked);
      if (score < bestScore) [best, bestScore] = [d, score];
    }
    if (best) booked.get(best)!.push(r);
    else notes.push(`${getDiscipline(r.slot.disciplineId).name} (${r.slot.variant}) non placée : aucun créneau assez long.`);
  }
  improvePlacement(open, booked);

  // Mobilité : jours libres en priorité (récupération active), sinon en complément court.
  if (mobility) {
    const count = mobility.sessionsPerWeek ?? (w.recoveryOnly ? 3 : DEFAULT_SESSIONS[mobility.priority]);
    for (const slot of getGenerator("mobility")!.planSlots(count, weekContext(p, mobility, weekIndex))) {
      const free = trainingDays.find((d) => booked.get(d)!.length === 0 && open.get(d)!.maxMinutes >= slot.minMinutes);
      if (free) {
        booked.get(free)!.push({ slot, ud: mobility, addOn: false });
        continue;
      }
      const host = trainingDays.find((d) => {
        const rs = booked.get(d)!;
        const used = rs.reduce((s, r) => s + r.slot.preferredMinutes, 0);
        return !rs.some((r) => r.slot.disciplineId === "mobility") && open.get(d)!.maxMinutes - used >= 10;
      });
      if (host) booked.get(host)!.push({ slot, ud: mobility, addOn: true });
      else notes.push("Une séance de mobilité n'a pas pu être placée faute de temps.");
    }
  }

  // Génération réelle avec le temps effectivement disponible ce jour-là.
  const days: DayPlan[] = WEEKDAYS.map((day) => {
    const { available, maxMinutes } = open.get(day)!;
    const rs = booked.get(day)!;
    const addOnMin = rs.some((r) => r.addOn) ? ADD_ON_MINUTES : 0;
    const sessions = rs.map((r) => {
      const duration = r.addOn
        ? Math.min(ADD_ON_MINUTES, r.slot.preferredMinutes, Math.max(10, maxMinutes - rs.filter((x) => !x.addOn).reduce((s, x) => s + x.slot.preferredMinutes, 0)))
        : Math.min(maxMinutes - addOnMin, r.slot.preferredMinutes);
      return buildSession(p, r.ud, r.slot, day, duration, weekIndex, r.addOn);
    });
    return { day, available, maxMinutes, sessions, status: "rest" as const };
  });

  return finalize({ weekIndex, days, conflicts: [], notes }, p);
}
