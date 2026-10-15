import type { FlushReport, Outbox, Transport } from "./outbox.js";

export interface Connectivity {
  isOnline(): boolean;
  /** Notifie chaque changement d'état réseau ; renvoie la fonction de désabonnement. */
  subscribe(listener: (online: boolean) => void): () => void;
}

export interface SyncStatus {
  syncing: boolean;
  lastSyncAt?: number;
  lastReport?: FlushReport;
  lastError?: string;
}

/**
 * Synchronisation ascendante en tâche de fond. L'interface n'attend jamais le réseau :
 * elle écrit dans l'outbox (local, immédiat) puis appelle `notifyChange`, qui déclenche
 * un envoi sans bloquer. Le retour de connectivité relance automatiquement l'envoi.
 */
export class SyncManager {
  private status: SyncStatus = { syncing: false };
  private unsubscribe?: () => void;
  private retryTimer?: ReturnType<typeof setTimeout>;

  constructor(
    private readonly outbox: Outbox,
    private readonly transport: Transport,
    private readonly connectivity: Connectivity,
    private readonly clock: () => number = Date.now,
    private readonly onStatus: (s: SyncStatus) => void = () => {},
  ) {}

  start(): void {
    this.unsubscribe = this.connectivity.subscribe((online) => {
      if (online) void this.syncNow();
    });
    if (this.connectivity.isOnline()) void this.syncNow();
  }

  stop(): void {
    this.unsubscribe?.();
    if (this.retryTimer) clearTimeout(this.retryTimer);
  }

  /** À appeler après chaque écriture locale ; ne bloque pas l'appelant. */
  notifyChange(): void {
    if (this.connectivity.isOnline()) void this.syncNow();
  }

  getStatus(): SyncStatus {
    return { ...this.status };
  }

  /** Lance un envoi ; ne lève jamais d'exception (l'état d'erreur est exposé dans le statut). */
  async syncNow(): Promise<FlushReport | undefined> {
    if (!this.connectivity.isOnline()) return undefined;
    this.update({ syncing: true });
    try {
      const report = await this.outbox.flush(this.transport, this.clock());
      this.update({ syncing: false, lastSyncAt: this.clock(), lastReport: report, ...(report.error ? { lastError: report.error } : {}) });
      if (report.remaining > 0) this.scheduleRetry();
      return report;
    } catch (e) {
      this.update({ syncing: false, lastError: e instanceof Error ? e.message : String(e) });
      this.scheduleRetry();
      return undefined;
    }
  }

  private scheduleRetry(): void {
    if (this.retryTimer) return;
    void this.outbox.pending().then((ms) => {
      const next = ms[0]?.nextAttemptAt;
      if (next === undefined) return;
      this.retryTimer = setTimeout(() => {
        this.retryTimer = undefined;
        void this.syncNow();
      }, Math.max(1_000, next - this.clock()));
    });
  }

  private update(patch: Partial<SyncStatus>): void {
    this.status = { ...this.status, ...patch };
    this.onStatus(this.getStatus());
  }
}
