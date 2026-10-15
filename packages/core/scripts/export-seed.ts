/**
 * Génère db/seed/0001_catalog.sql à partir du catalogue TypeScript (source unique de vérité).
 * Le seed est idempotent et rejouable : les référentiels sont mis à jour (upsert), les liaisons
 * ajoutées si absentes. Il est appliqué par scripts/migrate.ts après les migrations.
 * Usage : npm run db:seed:export
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { listDisciplines } from "../src/domain/disciplines.js";
import { BASE_EQUIPMENT, ENVIRONMENTS, GOALS } from "../src/domain/enums.js";
import { EXERCISES } from "../src/exercises/library.js";
import { allAchievements } from "../src/gamification/achievements.js";
import { listGenerators } from "../src/generators/registry.js";

const q = (v: string | null | undefined): string => (v == null ? "NULL" : `'${v.replace(/'/g, "''")}'`);
const arr = (xs: readonly string[], type = "TEXT"): string => `ARRAY[${xs.map(q).join(", ")}]::${type}[]`;

/** INSERT multi-lignes ; `update` = colonnes à mettre à jour en cas de conflit sur `key`. */
function rows(table: string, cols: string[], values: string[][], conflict: { key: string[]; update?: string[] }): string {
  if (!values.length) return "";
  const action = conflict.update?.length
    ? `DO UPDATE SET ${conflict.update.map((c) => `${c} = EXCLUDED.${c}`).join(", ")}`
    : "DO NOTHING";
  return `INSERT INTO ${table} (${cols.join(", ")}) VALUES\n  ${values.map((v) => `(${v.join(", ")})`).join(",\n  ")}\nON CONFLICT (${conflict.key.join(", ")}) ${action};\n`;
}

const SPORT_NAMES: Record<string, string> = {
  strength: "Force",
  conditioning: "Conditionnement",
  endurance: "Endurance",
  bodyweight: "Poids du corps",
  mind_body: "Corps & esprit",
  combat: "Combat",
  team: "Sports collectifs",
  other: "Autres",
};

export function buildSeedSql(): string {
  const disciplines = listDisciplines();
  const out: string[] = ["-- Généré par scripts/export-seed.ts — ne pas modifier à la main."];
  const nameUpsert = { key: ["id"], update: ["name"] };

  out.push(rows("sports", ["id", "name"], Object.entries(SPORT_NAMES).map(([id, n]) => [q(id), q(n)]), nameUpsert));
  out.push(rows("sport_goals", ["id", "name"], GOALS.map((g) => [q(g), q(g)]), nameUpsert));
  out.push(rows("environments", ["id", "name"], ENVIRONMENTS.map((e) => [q(e), q(e)]), nameUpsert));
  const equipment = [...new Set([...BASE_EQUIPMENT, ...EXERCISES.flatMap((e) => e.equipmentOptions.flat())])];
  out.push(rows("equipment", ["id", "name"], equipment.map((e) => [q(e), q(e.replace(/^custom:/, ""))]), nameUpsert));
  const categories = [...new Set(EXERCISES.flatMap((e) => e.categories))];
  out.push(rows("exercise_categories", ["id", "name"], categories.map((c) => [q(c), q(c)]), nameUpsert));

  out.push(
    rows(
      "disciplines",
      ["id", "sport_id", "name", "coverage", "metric_model"],
      disciplines.map((d) => [q(d.id), q(d.family), q(d.name), `${q(d.coverage)}::coverage_level`, `${q(d.metricModel)}::metric_model`]),
      { key: ["id"], update: ["sport_id", "name", "coverage", "metric_model"] },
    ),
  );
  out.push(rows("discipline_block_kinds", ["discipline_id", "block_kind"], disciplines.flatMap((d) => [...new Set(d.allowedBlocks)].map((b) => [q(d.id), `${q(b)}::block_kind`])), { key: ["discipline_id", "block_kind"] }));
  out.push(rows("discipline_goals", ["discipline_id", "goal_id"], disciplines.flatMap((d) => d.supportsGoals.map((g) => [q(d.id), q(g)])), { key: ["discipline_id", "goal_id"] }));
  out.push(
    rows(
      "activity_types",
      ["id", "discipline_id", "variant", "name"],
      listGenerators().flatMap((g) => Object.entries(g.variants).map(([v, name]) => [q(`${g.disciplineId}:${v}`), q(g.disciplineId), q(v), q(name)])),
      { key: ["id"], update: ["name"] },
    ),
  );

  out.push(
    rows(
      "exercises",
      ["id", "name", "level", "pattern", "high_impact", "instructions", "prerequisites", "precautions", "stressed_regions", "progression_measures", "review_status"],
      EXERCISES.map((e) => [
        q(e.id),
        q(e.name),
        `${q(e.level)}::training_level`,
        `${q(e.pattern)}::movement_pattern`,
        String(e.highImpact),
        arr(e.instructions),
        arr(e.prerequisites),
        arr(e.precautions),
        arr(e.stressedRegions, "body_region"),
        arr(e.progressionMeasures, "progression_measure"),
        `${q(e.review.status)}::review_status`,
      ]),
      { key: ["id"], update: ["name", "level", "pattern", "high_impact", "instructions", "prerequisites", "precautions", "stressed_regions", "progression_measures", "review_status"] },
    ),
  );
  out.push(rows("exercise_disciplines", ["exercise_id", "discipline_id"], EXERCISES.flatMap((e) => e.disciplines.map((d) => [q(e.id), q(d)])), { key: ["exercise_id", "discipline_id"] }));
  out.push(rows("exercise_category_links", ["exercise_id", "category_id"], EXERCISES.flatMap((e) => e.categories.map((c) => [q(e.id), q(c)])), { key: ["exercise_id", "category_id"] }));
  out.push(rows("exercise_goals", ["exercise_id", "goal_id"], EXERCISES.flatMap((e) => e.goals.map((g) => [q(e.id), q(g)])), { key: ["exercise_id", "goal_id"] }));
  out.push(rows("exercise_environments", ["exercise_id", "environment_id"], EXERCISES.flatMap((e) => e.environments.map((v) => [q(e.id), q(v)])), { key: ["exercise_id", "environment_id"] }));
  out.push(rows("exercise_muscles", ["exercise_id", "muscle_group"], EXERCISES.flatMap((e) => e.muscles.map((m) => [q(e.id), q(m)])), { key: ["exercise_id", "muscle_group"] }));
  out.push(
    rows(
      "exercise_alternatives",
      ["exercise_id", "related_exercise_id", "relation"],
      EXERCISES.flatMap((e) => [
        ...e.easier.map((r) => [q(e.id), q(r), "'regression'::exercise_relation"]),
        ...e.harder.map((r) => [q(e.id), q(r), "'progression'::exercise_relation"]),
        ...e.alternatives.map((r) => [q(e.id), q(r), "'alternative'::exercise_relation"]),
      ]),
      { key: ["exercise_id", "related_exercise_id", "relation"] },
    ),
  );
  out.push(
    rows(
      "exercise_equipment_options",
      ["exercise_id", "position"],
      EXERCISES.flatMap((e) => e.equipmentOptions.map((_, position) => [q(e.id), String(position)])),
      { key: ["exercise_id", "position"] },
    ),
  );
  // Matériel de chaque option : l'identifiant d'option est résolu par (exercice, position).
  const items = EXERCISES.flatMap((e) => e.equipmentOptions.flatMap((set, position) => set.map((item) => `(${q(e.id)}, ${position}, ${q(item)})`)));
  if (items.length) {
    out.push(
      `INSERT INTO exercise_equipment (option_id, equipment_id)\nSELECT o.id, v.equipment_id FROM (VALUES\n  ${items.join(",\n  ")}\n) AS v(exercise_id, position, equipment_id)\nJOIN exercise_equipment_options o ON o.exercise_id = v.exercise_id AND o.position = v.position\nON CONFLICT DO NOTHING;\n`,
    );
  }
  out.push(
    rows(
      "exercise_assets",
      ["exercise_id", "kind", "uri", "hosting", "size_bytes", "sha256", "offline", "license", "source", "author"],
      EXERCISES.flatMap((e) =>
        e.assets.map((a) => [q(e.id), `${q(a.kind)}::asset_kind`, q(a.uri), `${q(a.hosting)}::asset_hosting`, a.sizeBytes ? String(a.sizeBytes) : "NULL", q(a.sha256), String(a.offline), q(a.license), q(a.source), q(a.author)]),
      ),
      { key: ["exercise_id", "uri"], update: ["kind", "hosting", "size_bytes", "sha256", "offline", "license", "source", "author"] },
    ),
  );
  out.push(
    rows(
      "achievements",
      ["id", "title", "description", "badge_icon", "badge_tier", "discipline_id"],
      allAchievements().map((a) => [q(a.id), q(a.title), q(a.description), q(a.badge.icon), `${q(a.badge.tier)}::badge_tier`, q(a.disciplineId)]),
      { key: ["id"], update: ["title", "description", "badge_icon", "badge_tier", "discipline_id"] },
    ),
  );
  return out.filter(Boolean).join("\n");
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const root = join(dirname(fileURLToPath(import.meta.url)), "..");
  const target = join(root, "db", "seed", "0001_catalog.sql");
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, buildSeedSql());
  console.log(`Seed écrit : ${target}`);
}
