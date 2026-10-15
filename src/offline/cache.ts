import { blockExerciseIds, type SessionPlan } from "../blocks/schema.js";
import { WEEKDAYS, type Weekday } from "../domain/enums.js";
import { findExercise } from "../exercises/library.js";
import type { Exercise, ExerciseAsset } from "../exercises/schema.js";
import { createLiveState, reduceLive, type LiveAction, type LiveState } from "../live/runner.js";
import type { WeeklySchedule } from "../planner/types.js";
import { getJson, setJson, type KeyValueStore } from "./storage.js";

export interface CachePrepareReport {
  sessionsCached: number;
  exercisesCached: number;
  /** Assets distants à télécharger maintenant (le téléchargement est fait par la plateforme). */
  assetsToDownload: ExerciseAsset[];
  /** Assets non préchargés faute de budget : la séance reste exécutable (fiche texte). */
  assetsSkippedForBudget: ExerciseAsset[];
}

/**
 * Cache hors-ligne : séances à venir, fiches des exercices référencés et manifeste des
 * assets à précharger. Une séance doit pouvoir s'exécuter entièrement sans réseau ; les
 * médias distants sont un plus, jamais une condition.
 */
export class OfflineCache {
  constructor(
    private readonly store: KeyValueStore,
    private readonly assetBudgetBytes = 150 * 1024 * 1024,
  ) {}

  /** Met en cache les séances de `fromDay` sur `daysAhead` jours (semaine cyclique). */
  async prepare(schedule: WeeklySchedule, fromDay: Weekday, daysAhead = 3, alreadyDownloaded: ReadonlySet<string> = new Set()): Promise<CachePrepareReport> {
    const start = WEEKDAYS.indexOf(fromDay);
    const days = Array.from({ length: Math.min(7, daysAhead) }, (_, i) => WEEKDAYS[(start + i) % 7]!);
    const sessions = schedule.days.filter((d) => days.includes(d.day)).flatMap((d) => d.sessions);
    const exerciseIds = new Set<string>();
    for (const s of sessions) {
      await setJson(this.store, `cache:session:${s.id}`, s.plan);
      s.plan.blocks.flatMap(blockExerciseIds).forEach((id) => exerciseIds.add(id));
    }
    const assetsToDownload: ExerciseAsset[] = [];
    const assetsSkippedForBudget: ExerciseAsset[] = [];
    let budget = this.assetBudgetBytes;
    for (const id of exerciseIds) {
      const ex = findExercise(id);
      if (!ex) continue;
      await setJson(this.store, `cache:exercise:${id}`, ex);
      for (const a of ex.assets) {
        if (a.hosting === "bundled" || !a.offline || alreadyDownloaded.has(a.uri)) continue;
        const size = a.sizeBytes ?? Infinity;
        if (size <= budget) {
          assetsToDownload.push(a);
          budget -= size;
        } else assetsSkippedForBudget.push(a);
      }
    }
    return { sessionsCached: sessions.length, exercisesCached: exerciseIds.size, assetsToDownload, assetsSkippedForBudget };
  }

  getSession(id: string): Promise<SessionPlan | null> {
    return getJson<SessionPlan>(this.store, `cache:session:${id}`);
  }

  getExercise(id: string): Promise<Exercise | null> {
    return getJson<Exercise>(this.store, `cache:exercise:${id}`);
  }
}

/**
 * Persistance de la séance en cours : chaque action est appliquée puis écrite localement
 * avant d'être reflétée à l'écran. Reprise exacte après fermeture de l'app ou crash.
 */
export class LiveSessionStore {
  constructor(private readonly store: KeyValueStore) {}

  async begin(plan: SessionPlan, plannedSessionId?: string): Promise<LiveState> {
    const state = createLiveState(plan, plannedSessionId);
    await setJson(this.store, `live:${plan.id}`, state);
    return state;
  }

  async dispatch(sessionId: string, action: LiveAction): Promise<LiveState> {
    const state = await getJson<LiveState>(this.store, `live:${sessionId}`);
    if (!state) throw new Error(`Aucune séance en cours : ${sessionId}`);
    const next = reduceLive(state, action);
    await setJson(this.store, `live:${sessionId}`, next);
    return next;
  }

  resume(sessionId: string): Promise<LiveState | null> {
    return getJson<LiveState>(this.store, `live:${sessionId}`);
  }

  clear(sessionId: string): Promise<void> {
    return this.store.delete(`live:${sessionId}`);
  }
}
