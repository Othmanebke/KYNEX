import { getJson, setJson, type KeyValueStore } from "./storage.js";

/**
 * File d'envoi persistante (« outbox ») : toute écriture faite hors-ligne y est d'abord
 * enregistrée localement, puis envoyée au serveur dès que le réseau revient.
 * Garanties :
 * - durabilité : `enqueue` n'est résolu qu'après écriture locale ;
 * - ordre : envoi dans l'ordre d'enregistrement, arrêt au premier échec pour ne pas réordonner ;
 * - idempotence : chaque mutation a un identifiant unique, le serveur ignore les doublons ;
 * - aucune perte : un rejet définitif est déplacé en « lettres mortes », jamais supprimé.
 */
export type MutationType =
  | "session_result.upsert"
  | "workout_session.status"
  | "workout_session.move"
  | "wellness.signal"
  | "rest_day.check_in";

export interface Mutation {
  id: string;
  seq: number;
  type: MutationType;
  payload: unknown;
  createdAt: number;
  attempts: number;
  nextAttemptAt: number;
  lastError?: string;
}

export interface TransportResult {
  /** Mutations appliquées (ou déjà connues) par le serveur. */
  acked: string[];
  /** Mutations refusées. `retryable: false` = invalide, ne sera jamais acceptée telle quelle. */
  rejected: Array<{ id: string; reason: string; retryable: boolean }>;
}

export type Transport = (batch: Mutation[]) => Promise<TransportResult>;

const PENDING = "outbox:pending:";
const DEAD = "outbox:dead:";
const SEQ = "outbox:seq";
const BACKOFF_BASE_MS = 2_000;
const BACKOFF_MAX_MS = 5 * 60_000;

export const backoffMs = (attempts: number): number => Math.min(BACKOFF_MAX_MS, BACKOFF_BASE_MS * 2 ** Math.max(0, attempts - 1));

const keyOf = (m: Pick<Mutation, "seq" | "id">) => `${PENDING}${String(m.seq).padStart(12, "0")}:${m.id}`;

export interface FlushReport {
  sent: number;
  acked: number;
  deadLettered: number;
  remaining: number;
  error?: string;
}

export class Outbox {
  private flushing: Promise<FlushReport> | null = null;

  constructor(
    private readonly store: KeyValueStore,
    private readonly newId: () => string = () => crypto.randomUUID(),
  ) {}

  /** Enregistrements sérialisés : deux appels simultanés n'obtiennent jamais le même numéro d'ordre. */
  private writes: Promise<unknown> = Promise.resolve();

  enqueue(type: MutationType, payload: unknown, now: number): Promise<Mutation> {
    const run = async () => {
      const seq = ((await getJson<number>(this.store, SEQ)) ?? 0) + 1;
      await setJson(this.store, SEQ, seq);
      const m: Mutation = { id: this.newId(), seq, type, payload, createdAt: now, attempts: 0, nextAttemptAt: now };
      await setJson(this.store, keyOf(m), m);
      return m;
    };
    const p = this.writes.then(run, run);
    this.writes = p.catch(() => undefined);
    return p;
  }

  async pending(): Promise<Mutation[]> {
    const keys = await this.store.keys(PENDING);
    const out: Mutation[] = [];
    for (const k of keys) {
      const m = await getJson<Mutation>(this.store, k);
      if (m) out.push(m);
    }
    return out;
  }

  async deadLetters(): Promise<Mutation[]> {
    const keys = await this.store.keys(DEAD);
    return (await Promise.all(keys.map((k) => getJson<Mutation>(this.store, k)))).filter((m): m is Mutation => m !== null);
  }

  /** Un seul envoi à la fois : les appels concurrents partagent la même promesse. */
  flush(transport: Transport, now: number, batchSize = 20): Promise<FlushReport> {
    if (!this.flushing) {
      this.flushing = this.doFlush(transport, now, batchSize).finally(() => {
        this.flushing = null;
      });
    }
    return this.flushing;
  }

  private async doFlush(transport: Transport, now: number, batchSize: number): Promise<FlushReport> {
    const report: FlushReport = { sent: 0, acked: 0, deadLettered: 0, remaining: 0 };
    let queue = await this.pending();
    while (queue.length) {
      const head = queue[0]!;
      if (head.nextAttemptAt > now) break; // en attente de backoff : on préserve l'ordre
      const batch = queue.slice(0, batchSize);
      report.sent += batch.length;
      let result: TransportResult;
      try {
        result = await transport(batch);
      } catch (e) {
        report.error = e instanceof Error ? e.message : String(e);
        await this.markFailed(batch, now, report.error);
        break;
      }
      const acked = new Set(result.acked);
      for (const m of batch) if (acked.has(m.id)) await this.store.delete(keyOf(m));
      report.acked += acked.size;
      let blocked = false;
      for (const r of result.rejected) {
        const m = batch.find((x) => x.id === r.id);
        if (!m) continue;
        if (r.retryable) {
          await this.markFailed([m], now, r.reason);
          blocked = true;
        } else {
          await this.store.delete(keyOf(m));
          await setJson(this.store, `${DEAD}${keyOf(m).slice(PENDING.length)}`, { ...m, lastError: r.reason });
          report.deadLettered++;
        }
      }
      // Mutations ni acquittées ni rejetées : laissées en file pour le prochain envoi.
      const unanswered = batch.filter((m) => !acked.has(m.id) && !result.rejected.some((r) => r.id === m.id));
      if (blocked || unanswered.length) break;
      queue = await this.pending();
    }
    report.remaining = (await this.store.keys(PENDING)).length;
    return report;
  }

  private async markFailed(ms: Mutation[], now: number, error: string): Promise<void> {
    for (const m of ms) {
      const attempts = m.attempts + 1;
      await setJson(this.store, keyOf(m), { ...m, attempts, nextAttemptAt: now + backoffMs(attempts), lastError: error });
    }
  }
}
