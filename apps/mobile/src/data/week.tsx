import "./local-storage";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { applyWellnessSignal, downgradeSession, moveSession, planWeek, removeSession, type Suggestion, type WellnessSignal, type TrainingProfile, type Weekday, type WeeklySchedule } from "@kynex/core";
import { findSession, isoDate, mondayOf, parseIsoDate, profileFingerprint, weekIndexBetween } from "@/features/week/week";
import { DAY_LABEL } from "@/ui/labels";

/**
 * Semaine en cours de l'utilisateur. Générée une fois par `planWeek`, puis conservée
 * avec ses modifications (déplacer / alléger / supprimer). Recalculée seulement si le
 * profil change. Une seule étape d'annulation, suffisante pour corriger un geste.
 */
export interface WeekApi {
  monday: Date;
  weekIndex: number;
  schedule: WeeklySchedule;
  /** Vrai si la semaine vient d'être recalculée parce que le profil a changé. */
  regenerated: boolean;
  lastAction: string | null;
  canUndo: boolean;
  move(sessionId: string, toDay: Weekday): void;
  downgrade(sessionId: string): void;
  remove(sessionId: string): void;
  applySuggestion(s: Suggestion): void;
  /** Signalement fatigue / douleur : remplace les séances concernées, sans pénalité. */
  applyWellness(signal: WellnessSignal): void;
  undo(): void;
  /** Repart de la semaine générée (annule toutes les modifications). */
  reset(): void;
  dismissNotice(): void;
}

const Ctx = createContext<WeekApi | null>(null);
type Stored = { fingerprint: string; schedule: WeeklySchedule };

function read<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}
function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Stockage indisponible : la semaine reste en mémoire pour la session.
  }
}

export function WeekProvider({ userId, profile, now, children }: { userId: string; profile: TrainingProfile; now?: Date; children: ReactNode }) {
  const monday = useMemo(() => mondayOf(now ?? new Date()), [now]);
  const fingerprint = useMemo(() => profileFingerprint(profile), [profile]);
  const weekKey = `kynex.week.${userId}.${isoDate(monday)}`;

  const weekIndex = useMemo(() => {
    const startKey = `kynex.planStart.${userId}`;
    let start = parseIsoDate(read<string>(startKey) ?? "");
    if (!start || start > monday) {
      start = monday;
      write(startKey, isoDate(monday));
    }
    return weekIndexBetween(start, monday);
  }, [userId, monday]);

  const [state, setState] = useState<{ schedule: WeeklySchedule; previous: WeeklySchedule | null; lastAction: string | null; regenerated: boolean } | null>(null);

  useEffect(() => {
    const stored = read<Stored>(weekKey);
    if (stored && stored.fingerprint === fingerprint) {
      setState({ schedule: stored.schedule, previous: null, lastAction: null, regenerated: false });
      return;
    }
    const schedule = planWeek(profile, { weekIndex });
    write(weekKey, { fingerprint, schedule } satisfies Stored);
    setState({ schedule, previous: null, lastAction: null, regenerated: stored !== null });
  }, [weekKey, fingerprint, profile, weekIndex]);

  const commit = useCallback(
    (edit: (s: WeeklySchedule) => WeeklySchedule, label: (s: WeeklySchedule) => string) => {
      setState((cur) => {
        if (!cur) return cur;
        const next = edit(cur.schedule);
        write(weekKey, { fingerprint, schedule: next } satisfies Stored);
        return { schedule: next, previous: cur.schedule, lastAction: label(cur.schedule), regenerated: false };
      });
    },
    [weekKey, fingerprint],
  );

  const title = (s: WeeklySchedule, id: string) => findSession(s, id)?.plan.title ?? "Séance";

  const move = useCallback(
    (id: string, toDay: Weekday) => commit((s) => moveSession(s, id, toDay, profile), (s) => `Déplacée au ${DAY_LABEL[toDay].long.toLowerCase()} : ${title(s, id)}`),
    [commit, profile],
  );
  const downgrade = useCallback((id: string) => commit((s) => downgradeSession(s, id, profile), (s) => `Allégée : ${title(s, id)}`), [commit, profile]);
  const remove = useCallback((id: string) => commit((s) => removeSession(s, id, profile), (s) => `Supprimée : ${title(s, id)}`), [commit, profile]);

  const applySuggestion = useCallback(
    (sug: Suggestion) => (sug.type === "move" ? move(sug.sessionId, sug.toDay) : sug.type === "downgrade" ? downgrade(sug.sessionId) : remove(sug.sessionId)),
    [move, downgrade, remove],
  );

  const applyWellness = useCallback(
    (signal: WellnessSignal) =>
      commit(
        (s) => applyWellnessSignal(s, signal, profile),
        () => `${signal.kind === "pain" ? "Douleur" : "Fatigue"} prise en compte : ${DAY_LABEL[signal.day].long.toLowerCase()} adapté`,
      ),
    [commit, profile],
  );

  const undo = useCallback(() => {
    setState((cur) => {
      if (!cur?.previous) return cur;
      write(weekKey, { fingerprint, schedule: cur.previous } satisfies Stored);
      return { schedule: cur.previous, previous: null, lastAction: null, regenerated: false };
    });
  }, [weekKey, fingerprint]);

  const reset = useCallback(() => {
    const schedule = planWeek(profile, { weekIndex });
    setState((cur) => {
      write(weekKey, { fingerprint, schedule } satisfies Stored);
      return { schedule, previous: cur?.schedule ?? null, lastAction: "Semaine recalculée", regenerated: false };
    });
  }, [profile, weekIndex, weekKey, fingerprint]);

  const dismissNotice = useCallback(() => setState((cur) => (cur ? { ...cur, regenerated: false, lastAction: null } : cur)), []);

  const api = useMemo<WeekApi | null>(
    () =>
      state
        ? {
            monday,
            weekIndex,
            schedule: state.schedule,
            regenerated: state.regenerated,
            lastAction: state.lastAction,
            canUndo: state.previous !== null,
            move,
            downgrade,
            remove,
            applySuggestion,
            applyWellness,
            undo,
            reset,
            dismissNotice,
          }
        : null,
    [state, monday, weekIndex, move, downgrade, remove, applySuggestion, applyWellness, undo, reset, dismissNotice],
  );
  if (!api) return null;
  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}

export function useWeek(): WeekApi {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useWeek doit être utilisé dans <WeekProvider>");
  return ctx;
}
