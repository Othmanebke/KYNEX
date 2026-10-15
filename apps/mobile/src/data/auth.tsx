import "./local-storage";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import * as Crypto from "expo-crypto";
import { authErrorMessage } from "./auth-rules";
import { createLocalAccount, verifyLocalAccount, type LocalAccountDeps } from "./local-accounts";
import { isSupabaseConfigured, supabase } from "./supabase";

export type AuthUser = { id: string; email?: string; mode: "cloud" | "local" };

type AuthState =
  | { status: "loading" }
  | { status: "signedOut" }
  | { status: "signedIn"; user: AuthUser };

export type AuthResult = { ok: true; needsConfirmation?: boolean } | { ok: false; message: string };

interface AuthApi {
  state: AuthState;
  cloudAvailable: boolean;
  signIn(email: string, password: string): Promise<AuthResult>;
  signUp(email: string, password: string): Promise<AuthResult>;
  startLocal(): void;
  signOut(): Promise<void>;
}

/** Session locale ouverte (compte local ou utilisateur sans compte). */
const LOCAL_KEY = "kynex.localUser";
/** Identifiant stable de l'utilisateur « sans compte » sur cet appareil. */
const ANON_KEY = "kynex.anonId";
const AuthContext = createContext<AuthApi | null>(null);

type LocalRecord = { id: string; email?: string; active: boolean };

const localDeps: LocalAccountDeps = {
  storage: {
    getItem: (k) => localStorage.getItem(k),
    setItem: (k, v) => localStorage.setItem(k, v),
  },
  sha256: (input) => Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, input),
  randomId: () => Crypto.randomUUID(),
};

function readLocalRecord(): LocalRecord | null {
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { id?: unknown; email?: unknown; active?: unknown };
    if (typeof parsed.id !== "string") return null;
    return { id: parsed.id, email: typeof parsed.email === "string" ? parsed.email : undefined, active: parsed.active !== false };
  } catch {
    return null;
  }
}

function writeLocalRecord(rec: LocalRecord): void {
  try {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(rec));
  } catch {
    // Stockage indisponible (navigation privée) : la session reste en mémoire.
  }
}

/** Utilisateur local dont la session est ouverte, sinon null. */
function readLocalUser(): AuthUser | null {
  const rec = readLocalRecord();
  return rec?.active ? { id: rec.id, email: rec.email, mode: "local" } : null;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: "loading" });

  useEffect(() => {
    const local = readLocalUser();
    if (!supabase) {
      setState(local ? { status: "signedIn", user: local } : { status: "signedOut" });
      return;
    }
    let cancelled = false;
    void supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      const u = data.session?.user;
      if (u) setState({ status: "signedIn", user: { id: u.id, email: u.email, mode: "cloud" } });
      else setState(local ? { status: "signedIn", user: local } : { status: "signedOut" });
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      const u = session?.user;
      if (u) setState({ status: "signedIn", user: { id: u.id, email: u.email, mode: "cloud" } });
      else setState(() => {
        const l = readLocalUser();
        return l ? { status: "signedIn", user: l } : { status: "signedOut" };
      });
    });
    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  const openLocalSession = useCallback((user: { id: string; email?: string }) => {
    writeLocalRecord({ ...user, active: true });
    setState({ status: "signedIn", user: { ...user, mode: "local" } });
  }, []);

  const signIn = useCallback(async (email: string, password: string): Promise<AuthResult> => {
    if (!supabase) {
      const res = await verifyLocalAccount(localDeps, email, password);
      if (!res.ok) return res;
      openLocalSession({ id: res.account.id, email: res.account.email });
      return { ok: true };
    }
    try {
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      return error ? { ok: false, message: authErrorMessage(error) } : { ok: true };
    } catch (e) {
      return { ok: false, message: authErrorMessage(e as Error) };
    }
  }, [openLocalSession]);

  const signUp = useCallback(async (email: string, password: string): Promise<AuthResult> => {
    if (!supabase) {
      const res = await createLocalAccount(localDeps, email, password);
      if (!res.ok) return res;
      openLocalSession({ id: res.account.id, email: res.account.email });
      return { ok: true };
    }
    try {
      const { data, error } = await supabase.auth.signUp({ email: email.trim(), password });
      if (error) return { ok: false, message: authErrorMessage(error) };
      // Confirmation par e-mail activée côté Supabase : pas de session tout de suite.
      return { ok: true, needsConfirmation: !data.session };
    } catch (e) {
      return { ok: false, message: authErrorMessage(e as Error) };
    }
  }, [openLocalSession]);

  const startLocal = useCallback(() => {
    // Même identifiant qu'avant : les données déjà saisies sans compte sont retrouvées.
    let id: string | null = null;
    try {
      id = localStorage.getItem(ANON_KEY);
      if (!id) {
        id = Crypto.randomUUID();
        localStorage.setItem(ANON_KEY, id);
      }
    } catch {
      id = id ?? Crypto.randomUUID();
    }
    openLocalSession({ id });
  }, [openLocalSession]);

  const signOut = useCallback(async () => {
    if (state.status === "signedIn" && state.user.mode === "cloud" && supabase) {
      await supabase.auth.signOut();
      return;
    }
    // Mode local : les données restent sur l'appareil, seule la session se ferme.
    const rec = readLocalRecord();
    if (rec) writeLocalRecord({ ...rec, active: false });
    setState({ status: "signedOut" });
  }, [state]);

  const api = useMemo<AuthApi>(
    () => ({ state, cloudAvailable: isSupabaseConfigured, signIn, signUp, startLocal, signOut }),
    [state, signIn, signUp, startLocal, signOut],
  );
  return <AuthContext.Provider value={api}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthApi {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth doit être utilisé dans <AuthProvider>");
  return ctx;
}
