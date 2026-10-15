import {
  getDiscipline,
  levelRank,
  MAX_HIGH_PER_WEEK,
  WEEKDAYS,
  WEEKLY_CNS_BUDGET,
  type BodyRegion,
  type Conflict,
  type Intensity,
  type Level,
  type ScheduledSession,
  type Suggestion,
  type TrainingProfile,
  type Weekday,
  type WeeklySchedule,
} from "@kynex/core";
import { DAY_LABEL, REGION_LABEL } from "@/ui/labels";

/** Logique pure de l'écran Semaine : dates, jauges, textes. Testée sans React. */

const DAY_MS = 86_400_000;

/** Lundi 00:00 (heure locale) de la semaine contenant `d`. */
export function mondayOf(d: Date): Date {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const offset = (x.getDay() + 6) % 7; // lundi = 0
  x.setDate(x.getDate() - offset);
  return x;
}

export const isoDate = (d: Date): string => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export function parseIsoDate(s: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
}

/** Numéro de semaine du cycle depuis la première semaine planifiée (0 = première). */
export function weekIndexBetween(start: Date, monday: Date): number {
  return Math.max(0, Math.round((monday.getTime() - start.getTime()) / (7 * DAY_MS)));
}

export const dateOfDay = (monday: Date, day: Weekday): Date => new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + WEEKDAYS.indexOf(day));

export const todayWeekday = (now: Date): Weekday => WEEKDAYS[(now.getDay() + 6) % 7]!;

const MONTHS = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];

/** « 13 – 19 oct. », « 27 oct. – 2 nov. », « 29 déc. 2025 – 4 janv. 2026 ». */
export function weekRangeLabel(monday: Date): string {
  const sunday = dateOfDay(monday, "sun");
  const sameYear = monday.getFullYear() === sunday.getFullYear();
  const sameMonth = sameYear && monday.getMonth() === sunday.getMonth();
  const end = `${sunday.getDate()} ${MONTHS[sunday.getMonth()]}${sameYear ? "" : ` ${sunday.getFullYear()}`}`;
  if (sameMonth) return `${monday.getDate()} – ${end}`;
  return `${monday.getDate()} ${MONTHS[monday.getMonth()]}${sameYear ? "" : ` ${monday.getFullYear()}`} – ${end}`;
}

/** Empreinte du profil : si elle change, la semaine stockée est recalculée. */
export const profileFingerprint = (p: TrainingProfile): string => JSON.stringify(p);

export const highestLevel = (p: TrainingProfile): Level =>
  p.disciplines.reduce<Level>((best, d) => (levelRank(d.level) > levelRank(best) ? d.level : best), "beginner");

export interface WeekGauges {
  intense: number;
  intenseMax: number;
  cns: number;
  cnsBudget: number;
  plannedMinutes: number;
  availableMinutes: number;
  sessions: number;
}

/** Mêmes calculs que la détection de conflits du socle (planner/conflicts.ts). */
export function weekGauges(s: WeeklySchedule, p: TrainingProfile): WeekGauges {
  const all = s.days.flatMap((d) => d.sessions);
  const level = highestLevel(p);
  return {
    intense: all.filter((x) => !x.addOn && x.plan.intensity === "high").length,
    intenseMax: MAX_HIGH_PER_WEEK[level],
    cns: all.reduce((n, x) => n + x.plan.load.cns, 0),
    cnsBudget: WEEKLY_CNS_BUDGET[level],
    plannedMinutes: all.reduce((n, x) => n + x.plan.estimatedMinutes, 0),
    availableMinutes: p.availability.reduce((n, a) => n + a.maxMinutes, 0),
    sessions: all.filter((x) => !x.addOn).length,
  };
}

/** Remplace les codes de jour du socle (« (thu → fri) ») par des noms français. */
export function frenchDays(message: string): string {
  return frenchRegions(message.replace(/\b(mon|tue|wed|thu|fri|sat|sun)\b/g, (d) => DAY_LABEL[d as Weekday].long.toLowerCase()));
}

/** Remplace les codes de zone du corps du socle (« (knee) ») par leur nom français. */
export function frenchRegions(message: string): string {
  return message.replace(/\((shoulder|elbow|wrist|lower_back|hip|knee|ankle|neck)\)/g, (_, r: BodyRegion) => `(${REGION_LABEL[r].toLowerCase()})`);
}

export const INTENSITY_LABEL: Record<Intensity, string> = {
  recovery: "Récupération",
  low: "Facile",
  moderate: "Modérée",
  high: "Intense",
};

export function findSession(s: WeeklySchedule, id: string): ScheduledSession | undefined {
  for (const d of s.days) {
    const x = d.sessions.find((y) => y.id === id);
    if (x) return x;
  }
  return undefined;
}

/** Libellé d'action d'une suggestion : « Déplacer Musculation — Bas du corps à samedi ». */
export function suggestionLabel(s: WeeklySchedule, sug: Suggestion): string {
  const title = findSession(s, sug.sessionId)?.plan.title ?? "la séance";
  switch (sug.type) {
    case "move":
      return `Déplacer « ${title} » à ${DAY_LABEL[sug.toDay].long.toLowerCase()}`;
    case "downgrade":
      return `Alléger « ${title} »`;
    case "remove":
      return `Supprimer « ${title} »`;
  }
}

/** Les conflits les plus graves d'abord ; « À corriger » avant « À surveiller ». */
export const sortConflicts = (cs: Conflict[]): Conflict[] => [...cs].sort((a, b) => (a.severity === b.severity ? 0 : a.severity === "error" ? -1 : 1));

/** Conflits qui concernent une séance (pour la marquer dans le calendrier). */
export const conflictsOf = (cs: Conflict[], sessionId: string): Conflict[] => cs.filter((c) => c.sessionIds.includes(sessionId));

/** La discipline est-elle en bêta (générée, règles non validées) ? */
export const isBeta = (disciplineId: string): boolean => getDiscipline(disciplineId).coverage === "beta";

/** Notes du socle signalant une discipline non programmée par nature (suivi seul / séance libre). */
const UNPROGRAMMED_NOTE = /^(.+?) : (suivi manuel disponible|discipline en alpha)/;

/**
 * Rend les notes du socle lisibles dans l'app : tutoiement, pluriels, libellés de variante
 * au lieu des identifiants internes. Les notes « suivi seul / alpha » sont retirées :
 * l'écran les regroupe sur une seule ligne.
 */
export function readableNotes(notes: string[], variantLabel: (disciplineName: string, variant: string) => string | undefined): string[] {
  return notes
    .filter((n) => !UNPROGRAMMED_NOTE.test(n))
    .map((n) =>
      frenchRegions(n)
        .replace(/\bvos\b/g, "tes")
        .replace(/\bvotre\b/g, "ta")
        .replace(/\b(\d+) séance\(s\)/g, (_, k: string) => `${k} séance${Number(k) > 1 ? "s" : ""}`)
        .replace(/^(.+?) \(([a-z0-9_]+)\) non placée/, (_, name: string, v: string) => `${name} — ${variantLabel(name, v) ?? "séance"} non placée`),
    );
}
