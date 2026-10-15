import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { buildSeedSql } from "../scripts/export-seed.js";
import { loadMigrations, migrate, type SqlExecutor } from "../scripts/migrate.js";
import { levelFromXp } from "../src/gamification/engine.js";

const executor = (db: PGlite): SqlExecutor => ({
  exec: async (sql) => {
    await db.exec(sql);
  },
  query: async <T>(sql: string, params: unknown[] = []) => (await db.query<T>(sql, params)).rows,
});

describe("schéma PostgreSQL : migrations, contraintes, RLS", () => {
  let db: PGlite;
  let alice: string;
  let bob: string;
  const one = async <T>(sql: string, params: unknown[] = []) => (await db.query<T>(sql, params)).rows[0]!;

  beforeAll(async () => {
    db = new PGlite();
    await migrate(executor(db));
    alice = (await one<{ id: string }>("INSERT INTO users DEFAULT VALUES RETURNING id")).id;
    bob = (await one<{ id: string }>("INSERT INTO users DEFAULT VALUES RETURNING id")).id;
  }, 60_000);

  it("le seed versionné est à jour avec le catalogue TypeScript", () => {
    const committed = readFileSync(join(__dirname, "..", "db", "seed", "0001_catalog.sql"), "utf8");
    expect(committed.replace(/\r\n/g, "\n")).toBe(buildSeedSql());
  });

  it("migrations incrémentales : rejouer n'applique rien, modifier une migration appliquée est refusé", async () => {
    expect(await migrate(executor(db))).toEqual([]);
    const files = loadMigrations();
    const tampered = files.map((f, i) => (i === 0 ? { ...f, checksum: "0".repeat(64) } : f));
    await expect(migrate(executor(db), tampered)).rejects.toThrow(/modifiée après application/);
  });

  it("charge le catalogue, y compris équipements personnalisés et types de séance", async () => {
    const n = async (t: string) => (await one<{ n: number }>(`SELECT count(*)::int AS n FROM ${t}`)).n;
    expect(await n("disciplines")).toBeGreaterThanOrEqual(22);
    expect(await n("exercises")).toBeGreaterThan(60);
    expect((await one<{ custom: boolean }>("SELECT custom FROM equipment WHERE id = 'custom:medicine_ball'")).custom).toBe(true);
    expect((await one<{ n: number }>("SELECT count(*)::int AS n FROM activity_types WHERE discipline_id = 'running'")).n).toBeGreaterThanOrEqual(5);
    expect((await one<{ c: string }>("SELECT coverage::text AS c FROM disciplines WHERE id = 'hybrid_hyrox'")).c).toBe("beta");
  });

  async function session(userId: string, disciplineId: string): Promise<string> {
    const p = await one<{ id: string }>(`INSERT INTO workout_programs (user_id, name, starts_on, weeks) VALUES ($1, 'p', '2026-10-12', 4) ON CONFLICT DO NOTHING RETURNING id`, [userId]).catch(() => null);
    const programId = p?.id ?? (await one<{ id: string }>("SELECT id FROM workout_programs WHERE user_id = $1", [userId])).id;
    const s = await one<{ id: string }>(
      `INSERT INTO training_schedules (program_id, user_id, week_index, week_start) VALUES ($1, $2, 0, '2026-10-12')
       ON CONFLICT (program_id, week_index) DO UPDATE SET week_start = EXCLUDED.week_start RETURNING id`,
      [programId, userId],
    );
    return (
      await one<{ id: string }>(
        `INSERT INTO workout_sessions (schedule_id, user_id, discipline_id, day, title, intensity, estimated_minutes, load_lower_body, load_upper_body, load_cardio, load_impact, load_cns)
         VALUES ($1, $2, $3, 'mon', 't', 'high', 45, 2, 0, 3, 3, 2) RETURNING id`,
        [s.id, userId, disciplineId],
      )
    ).id;
  }

  it("bloc : colonnes imposées par le format, et format autorisé par la discipline", async () => {
    const run = await session(alice, "running");
    await expect(db.query(`INSERT INTO workout_blocks (session_id, position, kind, exercise_id, repeats, rest_sec, intensity) VALUES ($1, 0, 'intervals', 'interval_run', 6, 90, 'high')`, [run])).rejects.toThrow();
    await db.query(`INSERT INTO workout_blocks (session_id, position, kind, exercise_id, repeats, rest_sec, work_distance_m, intensity) VALUES ($1, 0, 'intervals', 'interval_run', 6, 90, 400, 'high')`, [run]);
    const strength = await session(alice, "strength_training");
    await expect(db.query(`INSERT INTO workout_blocks (session_id, position, kind, exercise_id, distance_m, intensity) VALUES ($1, 0, 'distance', 'easy_run', 3000, 'low')`, [strength])).rejects.toThrow(/not allowed/);
  });

  it("métriques : modèle imposé par la discipline, tables typées cohérentes, splits", async () => {
    const r = await one<{ id: string }>(`INSERT INTO session_results (user_id, discipline_id, performed_on, status) VALUES ($1, 'running', '2026-10-13', 'completed') RETURNING id`, [alice]);
    await expect(db.query(`INSERT INTO session_metrics (result_id, metric_model) VALUES ($1, 'resistance')`, [r.id])).rejects.toThrow(/incompatible/);
    await db.query(`INSERT INTO session_metrics (result_id, metric_model, source) VALUES ($1, 'endurance', 'gps')`, [r.id]);
    await expect(db.query(`INSERT INTO session_metric_sets (result_id, position, exercise_id, reps) VALUES ($1, 0, 'push_up', 10)`, [r.id])).rejects.toThrow();
    await db.query(`INSERT INTO session_metric_endurance (result_id, duration_sec, distance_m, elevation_gain_m, elevation_loss_m) VALUES ($1, 1800, 5000, 40, 38)`, [r.id]);
    await db.query(`INSERT INTO session_metric_splits (result_id, idx, distance_m, duration_sec) VALUES ($1, 1, 1000, 352.4)`, [r.id]);
    await expect(db.query(`INSERT INTO session_metric_endurance (result_id, duration_sec, moving_time_sec) VALUES ($1, 100, 200)`, [r.id])).rejects.toThrow();
  });

  it("XP : jamais négative, niveaux tenus à jour par la base avec la même formule que l'app", async () => {
    await expect(db.query(`INSERT INTO xp_events (id, user_id, occurred_on, amount, reason, source_id) VALUES ('neg', $1, '2026-10-14', -10, 'session', 's')`, [alice])).rejects.toThrow();
    let total = 0;
    for (const [i, amount] of [50, 20, 15, 300, 1000, 2500].entries()) {
      total += amount;
      await db.query(`INSERT INTO xp_events (id, user_id, occurred_on, amount, reason, discipline_id, source_id) VALUES ($1, $2, '2026-10-14', $3, 'session', 'running', 's')`, [`e${i}`, alice, amount]);
      const s = await one<{ total_xp: number; global_level: number }>("SELECT total_xp::int, global_level FROM user_gamification_stats WHERE user_id = $1", [alice]);
      expect(s.total_xp).toBe(total);
      expect(s.global_level).toBe(levelFromXp(total).level);
    }
    expect((await one<{ xp: number }>("SELECT xp::int FROM user_discipline_xp WHERE user_id = $1 AND discipline_id = 'running'", [alice])).xp).toBe(total);
    for (const xp of [0, 99, 100, 302, 303, 1000, 5000, 123456]) {
      expect((await one<{ l: number }>("SELECT xp_level($1) AS l", [xp])).l, `xp=${xp}`).toBe(levelFromXp(xp).level);
    }
  });

  it("un seul record courant par clé", async () => {
    const r = await one<{ id: string }>(`INSERT INTO session_results (user_id, discipline_id, performed_on, status) VALUES ($1, 'strength_training', '2026-10-14', 'completed') RETURNING id`, [alice]);
    const ins = `INSERT INTO personal_records (user_id, record_key, discipline_id, label, value, unit, better, session_result_id, achieved_on) VALUES ($1, 'strength_training:back_squat:load@5', 'strength_training', 'Squat 5 rép.', $2, 'kg', 'higher', $3, '2026-10-14')`;
    await db.query(ins, [alice, 80, r.id]);
    await expect(db.query(ins, [alice, 85, r.id])).rejects.toThrow();
  });

  it("import : une activité externe n'est enregistrée qu'une fois par utilisateur", async () => {
    const ins = `INSERT INTO session_results (user_id, discipline_id, performed_on, status, external_provider, external_id) VALUES ($1, 'running', '2026-10-15', 'completed', 'strava', '42')`;
    await db.query(ins, [alice]);
    await expect(db.query(ins, [alice])).rejects.toThrow();
    await db.query(ins, [bob]); // autre utilisateur : autorisé
  });

  it("RLS : un utilisateur ne voit que ses données et ne peut pas s'attribuer d'XP", async () => {
    await db.exec(`
      CREATE ROLE app_user NOLOGIN;
      GRANT USAGE ON SCHEMA public, auth TO app_user;
      GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_user;
      GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO app_user;
    `);
    const asUser = async <T>(userId: string, sql: string, params: unknown[] = []): Promise<T[]> => {
      await db.exec(`SET ROLE app_user; SELECT set_config('request.jwt.claim.sub', '${userId}', false);`);
      try {
        return (await db.query<T>(sql, params)).rows;
      } finally {
        await db.exec("RESET ROLE;");
      }
    };
    const aliceSees = await asUser<{ user_id: string }>(alice, "SELECT user_id FROM session_results");
    expect(aliceSees.length).toBeGreaterThan(0);
    expect(aliceSees.every((r) => r.user_id === alice)).toBe(true);
    expect(await asUser(bob, "SELECT * FROM session_metric_endurance")).toEqual([]);
    expect((await asUser<{ n: number }>(bob, "SELECT count(*)::int AS n FROM exercises"))[0]!.n).toBeGreaterThan(0);
    await expect(asUser(alice, `INSERT INTO xp_events (id, user_id, occurred_on, amount, reason, source_id) VALUES ('cheat', $1, '2026-10-14', 9999, 'session', 'x')`, [alice])).rejects.toThrow();
    await expect(asUser(alice, `INSERT INTO session_results (user_id, discipline_id, performed_on, status) VALUES ($1, 'running', '2026-10-15', 'completed')`, [bob])).rejects.toThrow();
  });
});
