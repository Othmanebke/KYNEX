import { findExercise, getDiscipline, type PersonalRecord, type SessionResult } from "@kynex/core";
import { formatDistance, formatPace, formatSec } from "@/features/session/blocks";
import { isoDate, mondayOf, parseIsoDate } from "@/features/week/week";

/** Présentation de l'historique. Ce qui n'a pas été mesuré est dit « non mesuré », jamais 0. */

const exName = (id: string) => findExercise(id)?.name ?? id;

/** Libellé français d'un record à partir de sa clé (le libellé du socle contient l'identifiant brut). */
export function recordLabel(r: PersonalRecord): string {
  const [, a, b] = r.key.split(":");
  if (a && b?.startsWith("load@")) return `${exName(a)} — ${b.slice(5)} rép.`;
  if (a && b === "reps") return `${exName(a)} — max de répétitions`;
  if (a && b === "hold") return `${exName(a)} — maintien`;
  if (a === "longest_distance") return "Plus longue distance";
  if (a === "longest_duration") return "Plus longue durée";
  if (a?.startsWith("best_pace_over_")) return `Meilleure allure (≥ ${Number(a.replace("best_pace_over_", "").replace("m", "")) / 1000} km)`;
  return r.label.replace(/\b([a-z]+_[a-z0-9_]+)\b/g, (m) => exName(m));
}

export function recordValue(r: PersonalRecord): string {
  switch (r.unit) {
    case "kg":
      return `${r.value.toLocaleString("fr-FR")} kg`;
    case "reps":
      return `${r.value} rép.`;
    case "sec":
      return formatSec(r.value);
    case "m":
      return formatDistance(r.value);
    case "sec_per_km":
      return formatPace(r.value);
    case "rounds_reps":
      return `${Math.floor(r.value / 1000)} tours + ${r.value % 1000} rép.`;
  }
}

export const STATUS_LABEL: Record<SessionResult["status"], string> = { completed: "Complète", partial: "Partielle", skipped: "Non réalisée" };

/** Résumé d'une séance réalisée : uniquement les mesures présentes. */
export function resultSummary(r: SessionResult): string[] {
  const out: string[] = [];
  out.push(r.durationSec ? formatSec(r.durationSec) : "durée non mesurée");
  const m = r.metrics;
  if (m?.model === "resistance") {
    const sets = m.exercises.reduce((n, e) => n + e.sets.length, 0);
    out.push(`${m.exercises.length} exercice${m.exercises.length > 1 ? "s" : ""} · ${sets} série${sets > 1 ? "s" : ""}`);
  } else if (m?.model === "endurance") {
    if (m.distanceM !== undefined) out.push(formatDistance(m.distanceM));
    if (m.elevationGainM !== undefined) out.push(`D+ ${m.elevationGainM} m`);
  } else if (m?.model === "skill") {
    out.push(`${m.exercises.length} exercice${m.exercises.length > 1 ? "s" : ""}`);
  } else if (m?.model === "practice") {
    out.push(`${m.practices.length} mouvement${m.practices.length > 1 ? "s" : ""}`);
  } else if (m?.model === "wod") {
    out.push(m.format.toUpperCase());
  } else if (r.status !== "skipped") {
    out.push("aucune mesure saisie");
  }
  if (r.perceivedEffort) out.push(`effort ${r.perceivedEffort}/10`);
  return out;
}

/** Nombre de séances réalisées par semaine, sur les `n` dernières semaines (la plus ancienne d'abord). */
export function weeklyCounts(results: SessionResult[], now: Date, n = 8): { weekStart: string; count: number; label: string }[] {
  const monday = mondayOf(now);
  const weeks = Array.from({ length: n }, (_, i) => {
    const d = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() - 7 * (n - 1 - i));
    return { weekStart: isoDate(d), count: 0, label: `${d.getDate()}/${d.getMonth() + 1}` };
  });
  for (const r of results) {
    if (r.status === "skipped") continue;
    const d = parseIsoDate(r.date);
    if (!d) continue;
    const w = weeks.find((x) => x.weekStart === isoDate(mondayOf(d)));
    if (w) w.count++;
  }
  return weeks;
}

/** Résultats regroupés par jour, du plus récent au plus ancien. */
export function groupByDay(results: SessionResult[]): { date: string; items: SessionResult[] }[] {
  const map = new Map<string, SessionResult[]>();
  for (const r of [...results].sort((a, b) => (b.startedAt ?? b.date).localeCompare(a.startedAt ?? a.date))) {
    map.set(r.date, [...(map.get(r.date) ?? []), r]);
  }
  return [...map].map(([date, items]) => ({ date, items }));
}

const MONTHS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];
const DAYS = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];

/** « Lundi 12 octobre », « Aujourd'hui », « Hier ». */
export function dayLabel(date: string, now: Date): string {
  const d = parseIsoDate(date);
  if (!d) return date;
  const today = isoDate(now);
  const y = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  if (date === today) return "Aujourd'hui";
  if (date === isoDate(y)) return "Hier";
  const s = `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}${d.getFullYear() !== now.getFullYear() ? ` ${d.getFullYear()}` : ""}`;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export const disciplineName = (id: string): string => getDiscipline(id).name;
