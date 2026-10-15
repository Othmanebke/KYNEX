import "./local-storage";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Platform } from "react-native";
import * as Crypto from "expo-crypto";
import { createLiveState, Outbox, reduceLive, type KeyValueStore, type LiveAction, type LiveState, type ScheduledSession, type SessionResultInput } from "@kynex/core";
import { isoDate } from "@/features/week/week";
import { emptyJournal, reviveJournal, saveLiveSession, saveManualSession, saveRestCheckIn, type Journal, type SaveOutcome } from "./journal-core";
import { useWeek } from "./week";

/** KeyValueStore du socle adossé au localStorage (SQLite sur mobile, navigateur sur le web). */
class LocalKV implements KeyValueStore {
  constructor(private readonly prefix: string) {}
  async get(key: string) {
    return localStorage.getItem(this.prefix + key);
  }
  async set(key: string, value: string) {
    localStorage.setItem(this.prefix + key, value);
  }
  async delete(key: string) {
    localStorage.removeItem(this.prefix + key);
  }
  async keys(prefix: string) {
    const out: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k?.startsWith(this.prefix + prefix)) out.push(k.slice(this.prefix.length));
    }
    return out.sort();
  }
}

function readJson(key: string): unknown {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
function writeJson(key: string, v: unknown): void {
  try {
    if (v === null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(v));
  } catch {
    // Stockage indisponible : l'état reste en mémoire pour la session.
  }
}

export interface JournalApi {
  journal: Journal;
  /** Séance en cours (persistée après chaque action : reprise après fermeture ou crash). */
  live: LiveState | null;
  startLive(session: ScheduledSession): void;
  dispatch(action: LiveAction): void;
  discardLive(): void;
  finishLive(input: { perceivedEffort?: number; painReported?: boolean }): SaveOutcome | null;
  addManual(input: Omit<SessionResultInput, "id" | "userId">): SaveOutcome;
  restCheckIn(date: string): void;
  /** Écritures en attente d'envoi au serveur (outbox). */
  pendingSync: number;
  online: boolean;
}

const Ctx = createContext<JournalApi | null>(null);

export function JournalProvider({ userId, children }: { userId: string; children: ReactNode }) {
  const week = useWeek();
  const jKey = `kynex.journal.${userId}`;
  const liveKey = `kynex.live.${userId}`;
  const [journal, setJournal] = useState<Journal>(() => reviveJournal(readJson(jKey), userId) ?? emptyJournal(userId));
  const [live, setLive] = useState<LiveState | null>(() => (readJson(liveKey) as LiveState | null) ?? null);
  const [pendingSync, setPending] = useState(0);
  const [online, setOnline] = useState(() => (Platform.OS === "web" && typeof navigator !== "undefined" ? navigator.onLine : true));
  const outbox = useRef(new Outbox(new LocalKV(`kynex.kv.${userId}.`), () => Crypto.randomUUID()));

  const refreshPending = useCallback(() => {
    void outbox.current.pending().then((p) => setPending(p.length));
  }, []);
  useEffect(refreshPending, [refreshPending]);

  useEffect(() => {
    if (Platform.OS !== "web" || typeof window === "undefined") return;
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);

  const persistJournal = useCallback(
    (j: Journal) => {
      setJournal(j);
      writeJson(jKey, j);
    },
    [jKey],
  );

  const setLivePersist = useCallback(
    (s: LiveState | null) => {
      setLive(s);
      writeJson(liveKey, s);
    },
    [liveKey],
  );

  const startLive = useCallback(
    (session: ScheduledSession) => {
      // Reprend la séance en cours si c'est la même ; sinon en prépare une nouvelle.
      if (live && live.plannedSessionId === session.id && live.status !== "finished" && live.status !== "abandoned") return;
      setLivePersist(createLiveState(session.plan, session.id));
    },
    [live, setLivePersist],
  );

  const dispatch = useCallback(
    (action: LiveAction) => {
      setLive((cur) => {
        if (!cur) return cur;
        const next = reduceLive(cur, action);
        if (next !== cur) writeJson(liveKey, next);
        return next;
      });
    },
    [liveKey],
  );

  const discardLive = useCallback(() => setLivePersist(null), [setLivePersist]);

  const enqueue = useCallback(
    (type: Parameters<Outbox["enqueue"]>[0], payload: unknown) => {
      void outbox.current.enqueue(type, payload, Date.now()).then(refreshPending);
    },
    [refreshPending],
  );

  const ctx = useMemo(() => ({ schedule: week.schedule, weekStart: isoDate(week.monday) }), [week.schedule, week.monday]);

  const finishLive = useCallback(
    (input: { perceivedEffort?: number; painReported?: boolean }): SaveOutcome | null => {
      if (!live) return null;
      const now = Date.now();
      const ended = live.status === "finished" ? live : reduceLive(live, { type: "abandon", at: now });
      const out = saveLiveSession(journal, ended, { resultId: Crypto.randomUUID(), userId, date: isoDate(new Date()), ...input }, ctx);
      persistJournal(out.journal);
      setLivePersist(null);
      enqueue("session_result.upsert", out.result);
      return out;
    },
    [live, journal, userId, ctx, persistJournal, setLivePersist, enqueue],
  );

  const addManual = useCallback(
    (input: Omit<SessionResultInput, "id" | "userId">): SaveOutcome => {
      const out = saveManualSession(journal, { ...input, id: Crypto.randomUUID(), userId }, ctx);
      persistJournal(out.journal);
      enqueue("session_result.upsert", out.result);
      return out;
    },
    [journal, userId, ctx, persistJournal, enqueue],
  );

  const restCheckIn = useCallback(
    (date: string) => {
      persistJournal(saveRestCheckIn(journal, date).journal);
      enqueue("rest_day.check_in", { date });
    },
    [journal, persistJournal, enqueue],
  );

  const api = useMemo(
    () => ({ journal, live, startLive, dispatch, discardLive, finishLive, addManual, restCheckIn, pendingSync, online }),
    [journal, live, startLive, dispatch, discardLive, finishLive, addManual, restCheckIn, pendingSync, online],
  );
  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}

export function useJournal(): JournalApi {
  const c = useContext(Ctx);
  if (!c) throw new Error("useJournal doit être utilisé dans <JournalProvider>");
  return c;
}
