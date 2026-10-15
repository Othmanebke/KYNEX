import { describe, expect, it } from "vitest";
import type { SessionPlan } from "../src/blocks/schema.js";
import { compliance, createLiveState, liveToSessionResult, reduceLive, remainingMs, type LiveState } from "../src/live/runner.js";
import { LiveSessionStore, OfflineCache } from "../src/offline/cache.js";
import { backoffMs, Outbox, type Mutation, type Transport } from "../src/offline/outbox.js";
import { MemoryStore } from "../src/offline/storage.js";
import { SyncManager, type Connectivity } from "../src/offline/sync-manager.js";
import { planWeek } from "../src/planner/orchestrator.js";
import { tonnage } from "../src/tracking/metrics.js";
import { gymProfile } from "./fixtures.js";

const load = { lowerBody: 2, upperBody: 0, cardio: 1, impact: 0, cns: 2 };
const strengthPlan: SessionPlan = {
  id: "s1",
  disciplineId: "strength_training",
  title: "Squat",
  intensity: "high",
  estimatedMinutes: 20,
  load,
  notes: [],
  blocks: [{ kind: "loaded_sets", exerciseId: "back_squat", sets: 3, reps: { min: 5, max: 5 }, load: { type: "absolute", kg: 80 }, restSec: 120, targetRpe: 8 }],
};

describe("séance en direct (minuteurs, saisie, reprise)", () => {
  it("déroule séries et repos, et le repos se termine tout seul", () => {
    let s = createLiveState(strengthPlan);
    expect(s.steps.map((x) => x.kind)).toEqual(["work_reps", "rest", "work_reps", "rest", "work_reps"]);
    s = reduceLive(s, { type: "start", at: 0 });
    s = reduceLive(s, { type: "complete", at: 30_000, actual: { reps: 5, loadKg: 80, rpe: 8 } });
    expect(s.current).toBe(1);
    expect(remainingMs(s, 90_000)).toBe(60_000);
    s = reduceLive(s, { type: "tick", at: 150_001 });
    expect(s.current).toBe(2);
  });

  it("la pause gèle le minuteur ; un minuteur écoulé en arrière-plan est rattrapé", () => {
    let s = reduceLive(createLiveState(strengthPlan), { type: "start", at: 0 });
    s = reduceLive(s, { type: "complete", at: 10_000, actual: { reps: 5 } });
    s = reduceLive(s, { type: "pause", at: 20_000 });
    s = reduceLive(s, { type: "resume", at: 80_000 });
    expect(remainingMs(s, 80_000)).toBe(110_000);
    s = reduceLive(s, { type: "tick", at: 10_000 * 60 });
    expect(s.current).toBe(2);
  });

  it("l'état est du JSON pur : il survit à une sérialisation (crash, fermeture de l'app)", () => {
    let s = reduceLive(createLiveState(strengthPlan), { type: "start", at: 0 });
    s = reduceLive(s, { type: "complete", at: 30_000, actual: { reps: 5, loadKg: 80 } });
    const restored = JSON.parse(JSON.stringify(s)) as LiveState;
    expect(reduceLive(restored, { type: "tick", at: 200_000 })).toEqual(reduceLive(s, { type: "tick", at: 200_000 }));
  });

  function finish(actuals: Array<Parameters<typeof reduceLive>[1]>): LiveState {
    return actuals.reduce(reduceLive, createLiveState(strengthPlan, "planned-1"));
  }

  it("produit un résultat à partir des seules saisies ; une série validée sans saisie n'est pas inventée", () => {
    const s = finish([
      { type: "start", at: 0 },
      { type: "complete", at: 30_000, actual: { reps: 5, loadKg: 80, rpe: 8 } },
      { type: "tick", at: 150_000 },
      { type: "complete", at: 180_000, actual: { asPrescribed: true } },
      { type: "tick", at: 300_000 },
      { type: "complete", at: 330_000 },
    ]);
    expect(s.status).toBe("finished");
    const r = liveToSessionResult(s, { resultId: "r1", userId: "u1", date: "2026-10-15", perceivedEffort: 8 });
    expect(r.status).toBe("completed");
    expect(r.plannedSessionId).toBe("planned-1");
    expect(r.durationSec).toBe(330);
    const m = r.metrics!;
    expect(m.model).toBe("resistance");
    if (m.model === "resistance") {
      expect(m.exercises[0]!.sets).toEqual([{ reps: 5, loadKg: 80, rpe: 8 }, { reps: 5, loadKg: 80 }]);
      expect(tonnage(m)).toEqual({ totalKg: 800, setsCounted: 2, setsWithoutLoad: 0, complete: true });
    }
  });

  it("mesure le respect de la prescription (dépassement de RPE signalé)", () => {
    const s = finish([
      { type: "start", at: 0 },
      { type: "complete", at: 30_000, actual: { reps: 5, rpe: 10 } },
      { type: "tick", at: 150_000 },
      { type: "complete", at: 180_000, actual: { reps: 5, rpe: 8 } },
      { type: "tick", at: 300_000 },
      { type: "complete", at: 330_000, actual: { reps: 5, rpe: 8 } },
    ]);
    expect(compliance(s)).toEqual({ workStepsPlanned: 3, workStepsDone: 3, workStepsAbovePrescription: 1, rpeDelta: 0.7 });
  });

  it("AMRAP : pas de score saisi = pas de résultat inventé", () => {
    const plan: SessionPlan = { ...strengthPlan, id: "h1", disciplineId: "hiit", blocks: [{ kind: "amrap", durationMin: 10, movements: [{ exerciseId: "burpee", reps: 10 }] }] };
    const run = (actual?: { rounds: number; extraReps: number }) => {
      let s = reduceLive(createLiveState(plan), { type: "start", at: 0 });
      s = actual ? reduceLive(s, { type: "complete", at: 600_000, actual }) : reduceLive(s, { type: "tick", at: 600_000 });
      return liveToSessionResult(s, { resultId: "r", userId: "u", date: "2026-10-15" });
    };
    expect(run().metrics).toBeUndefined();
    const scored = run({ rounds: 7, extraReps: 4 }).metrics;
    expect(scored?.model === "wod" && scored.result).toEqual({ type: "rounds_reps", rounds: 7, reps: 4 });
  });
});

describe("outbox hors-ligne", () => {
  let n = 0;
  const ids = () => `m${++n}`;

  it("rien n'est perdu sans réseau ; envoi dans l'ordre au retour de la connexion", async () => {
    const store = new MemoryStore();
    const box = new Outbox(store, ids);
    await box.enqueue("session_result.upsert", { id: "r1" }, 0);
    await box.enqueue("rest_day.check_in", { date: "2026-10-15" }, 1);
    const offline: Transport = async () => {
      throw new Error("offline");
    };
    const r1 = await box.flush(offline, 10);
    expect(r1).toMatchObject({ acked: 0, remaining: 2, error: "offline" });
    // Nouvelle instance sur le même stockage = redémarrage de l'app.
    const restarted = new Outbox(store, ids);
    const received: Mutation[] = [];
    const online: Transport = async (batch) => {
      received.push(...batch);
      return { acked: batch.map((m) => m.id), rejected: [] };
    };
    expect((await restarted.flush(online, 10)).acked).toBe(0); // backoff en cours : on attend
    expect((await restarted.flush(online, 10 + backoffMs(1))).acked).toBe(2);
    expect(received.map((m) => m.type)).toEqual(["session_result.upsert", "rest_day.check_in"]);
    expect(await restarted.pending()).toEqual([]);
  });

  it("un rejet définitif va en lettres mortes, sans bloquer la suite ni être supprimé", async () => {
    const box = new Outbox(new MemoryStore(), ids);
    const bad = await box.enqueue("session_result.upsert", { invalid: true }, 0);
    await box.enqueue("session_result.upsert", { id: "ok" }, 0);
    const report = await box.flush(async (batch) => ({ acked: batch.filter((m) => m.id !== bad.id).map((m) => m.id), rejected: [{ id: bad.id, reason: "schema", retryable: false }] }), 0);
    expect(report).toMatchObject({ acked: 1, deadLettered: 1, remaining: 0 });
    expect((await box.deadLetters()).map((m) => m.id)).toEqual([bad.id]);
  });

  it("des enregistrements simultanés gardent un ordre strict", async () => {
    const box = new Outbox(new MemoryStore(), ids);
    await Promise.all(Array.from({ length: 10 }, (_, i) => box.enqueue("wellness.signal", { i }, 0)));
    expect((await box.pending()).map((m) => m.seq)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  it("le gestionnaire synchronise en tâche de fond dès que le réseau revient", async () => {
    const box = new Outbox(new MemoryStore(), ids);
    await box.enqueue("session_result.upsert", { id: "r" }, 0);
    let online = false;
    const listeners: Array<(o: boolean) => void> = [];
    const connectivity: Connectivity = { isOnline: () => online, subscribe: (l) => (listeners.push(l), () => {}) };
    let calls = 0;
    const mgr = new SyncManager(box, async (b) => (calls++, { acked: b.map((m) => m.id), rejected: [] }), connectivity, () => 0);
    mgr.start();
    expect(calls).toBe(0);
    online = true;
    listeners.forEach((l) => l(true));
    await new Promise((r) => setTimeout(r, 0));
    await mgr.syncNow();
    expect(calls).toBe(1);
    expect(mgr.getStatus().lastReport?.remaining).toBe(0);
    mgr.stop();
  });
});

describe("cache hors-ligne", () => {
  it("met en cache les séances à venir et leurs fiches ; reprise d'une séance en cours", async () => {
    const store = new MemoryStore();
    const week = planWeek(gymProfile());
    const cache = new OfflineCache(store);
    const report = await cache.prepare(week, "mon", 3);
    const upcoming = week.days.filter((d) => ["mon", "tue", "wed"].includes(d.day)).flatMap((d) => d.sessions);
    expect(report.sessionsCached).toBe(upcoming.length);
    expect(report.exercisesCached).toBeGreaterThan(0);
    const first = upcoming[0]!;
    expect(await cache.getSession(first.id)).toEqual(first.plan);

    const live = new LiveSessionStore(store);
    await live.begin(first.plan, first.id);
    await live.dispatch(first.plan.id, { type: "start", at: 0 });
    await live.dispatch(first.plan.id, { type: "complete", at: 5_000 });
    const resumed = await new LiveSessionStore(store).resume(first.plan.id);
    expect(resumed?.entries).toHaveLength(1);
  });
});
