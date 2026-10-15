/**
 * Stockage local clé/valeur asynchrone. Implémentations prévues côté client :
 * IndexedDB (web/PWA), SQLite ou MMKV (mobile). Le domaine ne dépend que de ce contrat.
 * Exigence : `set` n'est résolu qu'une fois la donnée durablement écrite.
 */
export interface KeyValueStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
  /** Clés commençant par `prefix`, triées lexicographiquement. */
  keys(prefix: string): Promise<string[]>;
}

export class MemoryStore implements KeyValueStore {
  private readonly data = new Map<string, string>();
  async get(key: string) {
    return this.data.get(key) ?? null;
  }
  async set(key: string, value: string) {
    this.data.set(key, value);
  }
  async delete(key: string) {
    this.data.delete(key);
  }
  async keys(prefix: string) {
    return [...this.data.keys()].filter((k) => k.startsWith(prefix)).sort();
  }
}

export async function getJson<T>(store: KeyValueStore, key: string): Promise<T | null> {
  const raw = await store.get(key);
  return raw === null ? null : (JSON.parse(raw) as T);
}

export const setJson = (store: KeyValueStore, key: string, value: unknown): Promise<void> => store.set(key, JSON.stringify(value));
