/**
 * Runner de migrations incrémentales.
 * - Applique, dans l'ordre, les fichiers db/migrations/NNNN_*.sql non encore appliqués,
 *   chacun dans sa propre transaction, puis le seed du catalogue (idempotent).
 * - Enregistre une empreinte SHA-256 par migration : un fichier déjà appliqué qui a été
 *   modifié fait échouer le run. Toute évolution passe par un NOUVEAU fichier.
 *
 * Usage : DATABASE_URL=postgres://… npm run db:migrate
 */
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildSeedSql } from "./export-seed.js";

export interface SqlExecutor {
  /** Exécute un script SQL multi-instructions sans paramètres. */
  exec(sql: string): Promise<void>;
  query<T>(sql: string, params?: unknown[]): Promise<T[]>;
}

export interface MigrationFile {
  version: string;
  name: string;
  sql: string;
  checksum: string;
}

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const sha256 = (s: string) => createHash("sha256").update(s.replace(/\r\n/g, "\n")).digest("hex");

export function loadMigrations(dir = join(ROOT, "db", "migrations")): MigrationFile[] {
  return readdirSync(dir)
    .filter((f) => /^\d{4}_[a-z0-9_]+\.sql$/.test(f))
    .sort()
    .map((f) => {
      const sql = readFileSync(join(dir, f), "utf8");
      return { version: f.slice(0, 4), name: f, sql, checksum: sha256(sql) };
    });
}

export async function migrate(db: SqlExecutor, files = loadMigrations(), opts: { seed?: boolean } = {}): Promise<string[]> {
  await db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    version TEXT PRIMARY KEY, name TEXT NOT NULL, checksum CHAR(64) NOT NULL, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
  const applied = new Map((await db.query<{ version: string; checksum: string }>("SELECT version, checksum FROM schema_migrations")).map((r) => [r.version, r.checksum]));

  for (const f of files) {
    const known = applied.get(f.version);
    if (known && known.trim() !== f.checksum) {
      throw new Error(`La migration ${f.name} a été modifiée après application. Créez une nouvelle migration au lieu de la modifier.`);
    }
  }

  const done: string[] = [];
  for (const f of files) {
    if (applied.has(f.version)) continue;
    await db.exec("BEGIN");
    try {
      await db.exec(f.sql);
      await db.query("INSERT INTO schema_migrations (version, name, checksum) VALUES ($1, $2, $3)", [f.version, f.name, f.checksum]);
      await db.exec("COMMIT");
      done.push(f.name);
    } catch (e) {
      await db.exec("ROLLBACK");
      throw new Error(`Échec de ${f.name} : ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  if (opts.seed !== false) {
    await db.exec("BEGIN");
    try {
      await db.exec(buildSeedSql());
      await db.exec("COMMIT");
    } catch (e) {
      await db.exec("ROLLBACK");
      throw e;
    }
  }
  return done;
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL manquant.");
    process.exit(1);
  }
  const { default: postgres } = await import("postgres");
  const sql = postgres(url, { max: 1, onnotice: () => {} });
  const db: SqlExecutor = {
    exec: async (text) => {
      await sql.unsafe(text);
    },
    query: async <T>(text: string, params: unknown[] = []) => (await sql.unsafe(text, params as never[])) as unknown as T[],
  };
  try {
    const applied = await migrate(db);
    console.log(applied.length ? `Migrations appliquées : ${applied.join(", ")}` : "Schéma à jour.");
  } finally {
    await sql.end();
  }
}
