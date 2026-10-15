import { paceSecPerKm, type SessionResult } from "./metrics.js";

/**
 * Un record n'est comparable qu'à un record de même clé : même discipline, même
 * exercice/protocole, même nature de mesure. Aucune comparaison inter-métriques.
 */
export interface PersonalRecord {
  key: string;
  disciplineId: string;
  label: string;
  value: number;
  unit: "kg" | "reps" | "sec" | "m" | "sec_per_km" | "rounds_reps";
  /** "higher" : plus grand = meilleur ; "lower" : plus petit = meilleur (temps, allure). */
  better: "higher" | "lower";
  sessionId: string;
  date: string;
}

function* candidateRecords(r: SessionResult): Generator<Omit<PersonalRecord, "sessionId" | "date">> {
  const m = r.metrics;
  if (!m || r.status === "skipped") return;
  const d = r.disciplineId;
  switch (m.model) {
    case "resistance":
      for (const ex of m.exercises) {
        for (const s of ex.sets) {
          // Record de charge à nombre de répétitions donné ; pas de 1RM estimé.
          if (s.loadKg !== undefined) yield { key: `${d}:${ex.exerciseId}:load@${s.reps}`, disciplineId: d, label: `${ex.exerciseId} — ${s.reps} rép.`, value: s.loadKg, unit: "kg", better: "higher" };
        }
      }
      break;
    case "skill":
      for (const ex of m.exercises) {
        const v = ex.variation ? `:${ex.variation}` : "";
        for (const s of ex.sets) {
          if (s.reps !== undefined) yield { key: `${d}:${ex.exerciseId}${v}:reps`, disciplineId: d, label: `${ex.exerciseId} — max rép.`, value: s.reps, unit: "reps", better: "higher" };
          if (s.holdSec !== undefined) yield { key: `${d}:${ex.exerciseId}${v}:hold`, disciplineId: d, label: `${ex.exerciseId} — maintien`, value: s.holdSec, unit: "sec", better: "higher" };
        }
      }
      break;
    case "endurance": {
      if (m.distanceM !== undefined) {
        yield { key: `${d}:longest_distance`, disciplineId: d, label: "Plus longue distance", value: m.distanceM, unit: "m", better: "higher" };
        // Allure comparée uniquement par tranche de distance, pour ne pas opposer un 3 km à un semi.
        const bucket = [5000, 10000, 21097, 42195].filter((b) => m.distanceM! >= b).pop();
        const pace = paceSecPerKm(m);
        if (bucket && pace) yield { key: `${d}:best_pace_over_${bucket}m`, disciplineId: d, label: `Meilleure allure moyenne (≥ ${bucket / 1000} km)`, value: pace, unit: "sec_per_km", better: "lower" };
      }
      yield { key: `${d}:longest_duration`, disciplineId: d, label: "Plus longue durée", value: m.durationSec, unit: "sec", better: "higher" };
      break;
    }
    case "wod":
      if (!m.benchmark) break;
      if (m.result.type === "time") yield { key: `${d}:wod:${m.benchmark}:time`, disciplineId: d, label: `${m.benchmark} (temps)`, value: m.result.seconds, unit: "sec", better: "lower" };
      if (m.result.type === "rounds_reps") {
        // Encodage ordonnable : tours prioritaires sur répétitions.
        yield { key: `${d}:wod:${m.benchmark}:score`, disciplineId: d, label: `${m.benchmark} (tours + rép.)`, value: m.result.rounds * 1000 + m.result.reps, unit: "rounds_reps", better: "higher" };
      }
      break;
    case "practice":
      // Pas de « record » pour la pratique : la régularité est suivie par les statistiques.
      break;
  }
}

/** Met à jour les records avec une nouvelle séance ; renvoie les records battus. */
export function updateRecords(current: ReadonlyMap<string, PersonalRecord>, result: SessionResult): { records: Map<string, PersonalRecord>; improved: PersonalRecord[] } {
  const records = new Map(current);
  const improved: PersonalRecord[] = [];
  for (const c of candidateRecords(result)) {
    const prev = records.get(c.key);
    const isBetter = !prev || (c.better === "higher" ? c.value > prev.value : c.value < prev.value);
    if (isBetter) {
      const rec = { ...c, sessionId: result.id, date: result.date };
      records.set(c.key, rec);
      if (!improved.some((x) => x.key === c.key)) improved.push(rec);
      else improved[improved.findIndex((x) => x.key === c.key)] = rec;
    }
  }
  return { records, improved };
}
