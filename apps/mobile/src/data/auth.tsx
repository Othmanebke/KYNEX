import "./local-storage";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import * as Crypto from "expo-crypto";
import { authErrorMessage } from "./auth-rules";
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

const LOCAL_KEY = "kynex.localUser";
const AuthContext = createContext<AuthApi | null>(null);

type LocalRecord = { id: string; active: boolean };

function readLocalRecord(): LocalRecord | null {
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { id?: unknown; active?: unknown };
    return typeof parsed.id === "string" ? { id: parsed.id, active: parsed.active !== false } : null;
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
  return rec?.active ? { id: rec.id, mode: "local" } : null;
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

  const signIn = useCallback(async (email: string, password: string): Promise<AuthResult> => {
    if (!supabase) return { ok: false, message: "Le compte en ligne n'est pas encore disponible. Utilise le mode local." };
    try {
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      return error ? { ok: false, message: authErrorMessage(error) } : { ok: true };
    } catch (e) {
      return { ok: false, message: authErrorMessage(e as Error) };
    }
  }, []);

  const signUp = useCallback(async (email: string, password: string): Promise<AuthResult> => {
    if (!supabase) return { ok: false, message: "Le compte en ligne n'est pas encore disponible. Utilise le mode local." };
    try {
      const { data, error } = await supabase.auth.signUp({ email: email.trim(), password });
      if (error) return { ok: false, message: authErrorMessage(error) };
      // Confirmation par e-mail activée côté Supabase : pas de session tout de suite.
      return { ok: true, needsConfirmation: !data.session };
    } catch (e) {
      return { ok: false, message: authErrorMessage(e as Error) };
    }
  }, []);

  const startLocal = useCallback(() => {
    // Même identifiant qu'avant : les données locales déjà saisies sont retrouvées.
    const id = readLocalRecord()?.id ?? Crypto.randomUUID();
    writeLocalRecord({ id, active: true });
    setState({ status: "signedIn", user: { id, mode: "local" } });
  }, []);

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
