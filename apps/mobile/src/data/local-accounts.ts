/**
 * Comptes locaux (sans serveur) : e-mail + mot de passe enregistrés sur l'appareil.
 * Le mot de passe n'est jamais stocké : seulement un sel aléatoire et SHA-256(sel + mot de passe),
 * itéré. Protection contre la lecture directe du stockage, pas contre un attaquant
 * qui a l'appareil en main : c'est un mode local en attendant Supabase.
 * Module pur : stockage, hachage et aléa sont injectés (testable sans React Native).
 */
export interface KeyValue {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface LocalAccount {
  id: string;
  email: string;
  salt: string;
  hash: string;
  createdAt: string;
}

export interface LocalAccountDeps {
  storage: KeyValue;
  sha256: (input: string) => Promise<string>;
  randomId: () => string;
  now?: () => Date;
}

export type LocalResult = { ok: true; account: LocalAccount } | { ok: false; message: string };

const ACCOUNTS_KEY = "kynex.localAccounts";
const ROUNDS = 1000;

export const normalizeEmail = (email: string): string => email.trim().toLowerCase();

async function hashPassword(deps: LocalAccountDeps, salt: string, password: string): Promise<string> {
  let h = `${salt}:${password}`;
  for (let i = 0; i < ROUNDS; i++) h = await deps.sha256(`${salt}:${h}`);
  return h;
}

export function readAccounts(storage: KeyValue): LocalAccount[] {
  try {
    const raw = storage.getItem(ACCOUNTS_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? (parsed as LocalAccount[]).filter((a) => typeof a?.id === "string" && typeof a?.email === "string") : [];
  } catch {
    return [];
  }
}

export async function createLocalAccount(deps: LocalAccountDeps, email: string, password: string): Promise<LocalResult> {
  const accounts = readAccounts(deps.storage);
  const norm = normalizeEmail(email);
  if (accounts.some((a) => a.email === norm)) return { ok: false, message: "Un compte existe déjà avec cet e-mail sur cet appareil. Connecte-toi plutôt." };
  const salt = deps.randomId();
  const account: LocalAccount = {
    id: deps.randomId(),
    email: norm,
    salt,
    hash: await hashPassword(deps, salt, password),
    createdAt: (deps.now?.() ?? new Date()).toISOString(),
  };
  try {
    deps.storage.setItem(ACCOUNTS_KEY, JSON.stringify([...accounts, account]));
  } catch {
    return { ok: false, message: "Impossible d'enregistrer le compte sur cet appareil (stockage plein ou bloqué)." };
  }
  return { ok: true, account };
}

export async function verifyLocalAccount(deps: LocalAccountDeps, email: string, password: string): Promise<LocalResult> {
  const account = readAccounts(deps.storage).find((a) => a.email === normalizeEmail(email));
  // Même message que le mot de passe soit faux ou le compte absent : on ne révèle pas quels e-mails existent.
  if (!account || (await hashPassword(deps, account.salt, password)) !== account.hash) return { ok: false, message: "E-mail ou mot de passe incorrect." };
  return { ok: true, account };
}
