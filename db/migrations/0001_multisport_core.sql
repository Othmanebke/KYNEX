-- KYNEX — socle multisports (PostgreSQL ≥ 14 / Supabase)
--
-- Conventions :
--   * ENUM pour les ensembles fermés et stables (niveaux, intensités, formats de blocs, statuts…) ;
--   * TABLES de référence pour ce qui doit s'étendre sans migration de type
--     (disciplines, équipements, environnements, objectifs, catégories) : un INSERT suffit ;
--   * aucune colonne JSON fourre-tout : blocs et métriques ont des colonnes typées + CHECK ;
--   * une donnée non mesurée est NULL, jamais une valeur par défaut inventée ;
--   * pas de BEGIN/COMMIT ici : le runner (scripts/migrate.ts) exécute chaque fichier dans
--     une transaction et refuse toute modification d'un fichier déjà appliqué (checksum).

-- ═════════════════════════ Types énumérés ═════════════════════════
CREATE TYPE training_level     AS ENUM ('beginner', 'intermediate', 'advanced');
CREATE TYPE intensity_level    AS ENUM ('recovery', 'low', 'moderate', 'high');
CREATE TYPE coverage_level     AS ENUM ('alpha', 'beta', 'full', 'tracking_only');
CREATE TYPE metric_model       AS ENUM ('resistance', 'endurance', 'skill', 'practice', 'wod');
CREATE TYPE block_kind         AS ENUM ('sets_reps', 'loaded_sets', 'timed', 'distance', 'intervals', 'circuit', 'emom', 'amrap',
                                        'technique', 'warmup', 'mobility', 'cooldown', 'rest', 'outdoor');
CREATE TYPE weekday            AS ENUM ('mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun');
CREATE TYPE load_type          AS ENUM ('absolute', 'percent_1rm', 'rpe');
CREATE TYPE rest_mode          AS ENUM ('passive', 'walk', 'jog');
CREATE TYPE terrain_type       AS ENUM ('road', 'trail', 'track', 'mixed');
CREATE TYPE body_region        AS ENUM ('shoulder', 'elbow', 'wrist', 'lower_back', 'hip', 'knee', 'ankle', 'neck');
CREATE TYPE body_zone          AS ENUM ('neck', 'shoulders', 'thoracic_spine', 'lower_back', 'hips', 'hamstrings', 'quads', 'calves',
                                        'ankles', 'wrists', 'full_body');
CREATE TYPE movement_pattern   AS ENUM ('squat', 'hinge', 'lunge', 'horizontal_push', 'horizontal_pull', 'vertical_push', 'vertical_pull',
                                        'core', 'carry', 'locomotion', 'jump', 'full_body', 'mobility', 'stretch');
CREATE TYPE progression_measure AS ENUM ('load_kg', 'reps', 'sets', 'hold_sec', 'duration_sec', 'distance_m', 'pace', 'rounds',
                                         'range_of_motion', 'variation');
CREATE TYPE exercise_relation  AS ENUM ('regression', 'progression', 'alternative');
CREATE TYPE review_status      AS ENUM ('draft', 'internal_review', 'expert_validated');
CREATE TYPE asset_kind         AS ENUM ('animation_3d', 'video', 'image', 'diagram', 'route_map', 'technique_breakdown');
CREATE TYPE asset_hosting      AS ENUM ('bundled', 'remote');
CREATE TYPE fatigue_level      AS ENUM ('normal', 'elevated', 'high');
CREATE TYPE program_status     AS ENUM ('active', 'paused', 'completed', 'archived');
CREATE TYPE planned_status     AS ENUM ('planned', 'completed', 'partial', 'skipped', 'removed', 'substituted');
CREATE TYPE result_status      AS ENUM ('completed', 'partial', 'skipped');
CREATE TYPE measurement_source AS ENUM ('manual', 'live', 'gps', 'device', 'import');
CREATE TYPE integration_provider AS ENUM ('apple_health', 'health_connect', 'strava', 'garmin');
CREATE TYPE integration_status AS ENUM ('connected', 'revoked', 'error');
CREATE TYPE wod_format         AS ENUM ('for_time', 'amrap', 'emom', 'intervals', 'circuit');
CREATE TYPE wod_result_type    AS ENUM ('time', 'rounds_reps', 'intervals_completed', 'completed');
CREATE TYPE record_unit        AS ENUM ('kg', 'reps', 'sec', 'm', 'sec_per_km', 'rounds_reps');
CREATE TYPE record_direction   AS ENUM ('higher', 'lower');
CREATE TYPE xp_reason          AS ENUM ('session', 'planned_bonus', 'duration_bonus', 'personal_record', 'prescription_respected',
                                        'rest_day_check_in', 'weekly_goal', 'quest', 'achievement');
CREATE TYPE quest_scope        AS ENUM ('daily', 'weekly');
CREATE TYPE quest_goal_type    AS ENUM ('complete_planned_session', 'rest_day_check_in', 'wellness_check_in', 'complete_ratio_of_plan',
                                        'practice_distinct_disciplines', 'complete_discipline');
CREATE TYPE challenge_metric   AS ENUM ('sessions', 'distance_m', 'duration_sec');
CREATE TYPE badge_tier         AS ENUM ('bronze', 'silver', 'gold');

-- ═════════════════════════ Utilisateurs ═════════════════════════
-- Sur Supabase, id = auth.users.id (la ligne est créée à l'inscription).
-- Si une table users existe déjà dans l'application, cette instruction est sans effet.
CREATE TABLE IF NOT EXISTS users (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ═════════════════════════ Référentiels extensibles ═════════════════════════
CREATE TABLE sports (
  id    TEXT PRIMARY KEY CHECK (id ~ '^[a-z][a-z0-9_]*$'),
  name  TEXT NOT NULL
);

CREATE TABLE disciplines (
  id            TEXT PRIMARY KEY CHECK (id ~ '^[a-z][a-z0-9_]*$'),
  sport_id      TEXT NOT NULL REFERENCES sports(id),
  name          TEXT NOT NULL,
  coverage      coverage_level NOT NULL,
  metric_model  metric_model NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Formats de blocs autorisés par discipline (vérifiés aussi par trigger sur workout_blocks).
CREATE TABLE discipline_block_kinds (
  discipline_id  TEXT NOT NULL REFERENCES disciplines(id) ON DELETE CASCADE,
  block_kind     block_kind NOT NULL,
  PRIMARY KEY (discipline_id, block_kind)
);

CREATE TABLE sport_goals (
  id    TEXT PRIMARY KEY CHECK (id ~ '^[a-z][a-z0-9_]*$'),
  name  TEXT NOT NULL
);

CREATE TABLE discipline_goals (
  discipline_id  TEXT NOT NULL REFERENCES disciplines(id) ON DELETE CASCADE,
  goal_id        TEXT NOT NULL REFERENCES sport_goals(id),
  PRIMARY KEY (discipline_id, goal_id)
);

-- Types de séance propres à une discipline (upper, long, amrap, compromised…).
CREATE TABLE activity_types (
  id             TEXT PRIMARY KEY,                -- <discipline>:<variant>
  discipline_id  TEXT NOT NULL REFERENCES disciplines(id) ON DELETE CASCADE,
  variant        TEXT NOT NULL,
  name           TEXT NOT NULL,
  UNIQUE (discipline_id, variant)
);

CREATE TABLE environments (
  id    TEXT PRIMARY KEY CHECK (id ~ '^[a-z][a-z0-9_]*$'),
  name  TEXT NOT NULL
);

CREATE TABLE equipment (
  id      TEXT PRIMARY KEY CHECK (id ~ '^(custom:)?[a-z][a-z0-9_]*$'),
  name    TEXT NOT NULL,
  custom  BOOLEAN NOT NULL GENERATED ALWAYS AS (id LIKE 'custom:%') STORED
);

CREATE TABLE exercise_categories (
  id    TEXT PRIMARY KEY CHECK (id ~ '^[a-z][a-z0-9_]*$'),
  name  TEXT NOT NULL
);

-- ═════════════════════════ Bibliothèque d'exercices ═════════════════════════
CREATE TABLE exercises (
  id                    TEXT PRIMARY KEY CHECK (id ~ '^[a-z][a-z0-9_]*$'),
  name                  TEXT NOT NULL,
  level                 training_level NOT NULL,
  pattern               movement_pattern NOT NULL,
  high_impact           BOOLEAN NOT NULL DEFAULT false,
  instructions          TEXT[] NOT NULL CHECK (cardinality(instructions) > 0),
  prerequisites         TEXT[] NOT NULL DEFAULT '{}',
  precautions           TEXT[] NOT NULL DEFAULT '{}',
  stressed_regions      body_region[] NOT NULL DEFAULT '{}',
  progression_measures  progression_measure[] NOT NULL CHECK (cardinality(progression_measures) > 0),
  review_status         review_status NOT NULL DEFAULT 'draft',
  reviewer              TEXT,
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (review_status <> 'expert_validated' OR reviewer IS NOT NULL)
);

CREATE TABLE exercise_disciplines (
  exercise_id    TEXT NOT NULL REFERENCES exercises(id) ON DELETE CASCADE,
  discipline_id  TEXT NOT NULL REFERENCES disciplines(id),
  PRIMARY KEY (exercise_id, discipline_id)
);
CREATE INDEX exercise_disciplines_discipline_idx ON exercise_disciplines (discipline_id);

CREATE TABLE exercise_category_links (
  exercise_id  TEXT NOT NULL REFERENCES exercises(id) ON DELETE CASCADE,
  category_id  TEXT NOT NULL REFERENCES exercise_categories(id),
  PRIMARY KEY (exercise_id, category_id)
);

CREATE TABLE exercise_goals (
  exercise_id  TEXT NOT NULL REFERENCES exercises(id) ON DELETE CASCADE,
  goal_id      TEXT NOT NULL REFERENCES sport_goals(id),
  PRIMARY KEY (exercise_id, goal_id)
);

CREATE TABLE exercise_environments (
  exercise_id     TEXT NOT NULL REFERENCES exercises(id) ON DELETE CASCADE,
  environment_id  TEXT NOT NULL REFERENCES environments(id),
  PRIMARY KEY (exercise_id, environment_id)
);
CREATE INDEX exercise_environments_env_idx ON exercise_environments (environment_id);

CREATE TABLE exercise_muscles (
  exercise_id   TEXT NOT NULL REFERENCES exercises(id) ON DELETE CASCADE,
  muscle_group  TEXT NOT NULL,
  PRIMARY KEY (exercise_id, muscle_group)
);

-- Matériel : l'exercice est faisable si UNE option est entièrement disponible.
-- Une option sans ligne dans exercise_equipment = aucun matériel requis.
CREATE TABLE exercise_equipment_options (
  id           BIGSERIAL PRIMARY KEY,
  exercise_id  TEXT NOT NULL REFERENCES exercises(id) ON DELETE CASCADE,
  position     SMALLINT NOT NULL CHECK (position >= 0),
  UNIQUE (exercise_id, position)
);

CREATE TABLE exercise_equipment (
  option_id     BIGINT NOT NULL REFERENCES exercise_equipment_options(id) ON DELETE CASCADE,
  equipment_id  TEXT NOT NULL REFERENCES equipment(id),
  PRIMARY KEY (option_id, equipment_id)
);

-- Régressions (plus facile), progressions (plus difficile) et alternatives (même intention).
CREATE TABLE exercise_alternatives (
  exercise_id          TEXT NOT NULL REFERENCES exercises(id) ON DELETE CASCADE,
  related_exercise_id  TEXT NOT NULL REFERENCES exercises(id) ON DELETE CASCADE,
  relation             exercise_relation NOT NULL,
  PRIMARY KEY (exercise_id, related_exercise_id, relation),
  CHECK (exercise_id <> related_exercise_id)
);
CREATE INDEX exercise_alternatives_related_idx ON exercise_alternatives (related_exercise_id);

CREATE TABLE exercise_assets (
  id           BIGSERIAL PRIMARY KEY,
  exercise_id  TEXT NOT NULL REFERENCES exercises(id) ON DELETE CASCADE,
  kind         asset_kind NOT NULL,
  uri          TEXT NOT NULL,
  hosting      asset_hosting NOT NULL DEFAULT 'remote',
  size_bytes   BIGINT CHECK (size_bytes > 0),
  sha256       CHAR(64) CHECK (sha256 ~ '^[a-f0-9]{64}$'),
  offline      BOOLEAN NOT NULL DEFAULT true,       -- préchargé pour les séances hors-ligne
  license      TEXT NOT NULL CHECK (length(trim(license)) > 0),
  source       TEXT NOT NULL CHECK (length(trim(source)) > 0),
  author       TEXT,
  CHECK (hosting = 'bundled' OR size_bytes IS NOT NULL),   -- budget de cache calculable
  UNIQUE (exercise_id, uri)
);
CREATE INDEX exercise_assets_exercise_idx ON exercise_assets (exercise_id);

-- ═════════════════════════ Profil d'entraînement ═════════════════════════
CREATE TABLE training_profiles (
  user_id     UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  low_impact  BOOLEAN NOT NULL DEFAULT false,
  fatigue     fatigue_level NOT NULL DEFAULT 'normal',
  injured     BOOLEAN NOT NULL DEFAULT false,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE user_disciplines (
  user_id            UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  discipline_id      TEXT NOT NULL REFERENCES disciplines(id),
  level              training_level NOT NULL,
  priority           SMALLINT NOT NULL CHECK (priority BETWEEN 1 AND 3),
  sessions_per_week  SMALLINT CHECK (sessions_per_week BETWEEN 1 AND 6),
  PRIMARY KEY (user_id, discipline_id)
);

CREATE TABLE user_goals (
  user_id  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  goal_id  TEXT NOT NULL REFERENCES sport_goals(id),
  PRIMARY KEY (user_id, goal_id)
);

CREATE TABLE user_equipment (
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  equipment_id  TEXT NOT NULL REFERENCES equipment(id),
  PRIMARY KEY (user_id, equipment_id)
);

CREATE TABLE user_environments (
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  environment_id  TEXT NOT NULL REFERENCES environments(id),
  PRIMARY KEY (user_id, environment_id)
);

CREATE TABLE user_availability (
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day          weekday NOT NULL,
  max_minutes  SMALLINT NOT NULL CHECK (max_minutes BETWEEN 10 AND 240),
  PRIMARY KEY (user_id, day)
);

CREATE TABLE user_rest_days (
  user_id  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day      weekday NOT NULL,
  PRIMARY KEY (user_id, day)
);

CREATE TABLE user_pain_regions (
  user_id  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  region   body_region NOT NULL,
  PRIMARY KEY (user_id, region)
);

CREATE TABLE user_excluded_exercises (
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  exercise_id  TEXT NOT NULL REFERENCES exercises(id),
  PRIMARY KEY (user_id, exercise_id)
);

-- ═════════════════════════ Programmes et planification ═════════════════════════
CREATE TABLE workout_programs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  starts_on   DATE NOT NULL,
  weeks       SMALLINT NOT NULL CHECK (weeks BETWEEN 1 AND 52),
  status      program_status NOT NULL DEFAULT 'active',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX workout_programs_one_active ON workout_programs (user_id) WHERE status = 'active';

CREATE TABLE training_schedules (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id     UUID NOT NULL REFERENCES workout_programs(id) ON DELETE CASCADE,
  user_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  week_index     SMALLINT NOT NULL CHECK (week_index >= 0),
  week_start     DATE NOT NULL CHECK (extract(isodow FROM week_start) = 1),
  -- Semaine allégée suite à une fatigue/blessure déclarée : gèle la série de régularité.
  recovery_week  BOOLEAN NOT NULL DEFAULT false,
  UNIQUE (program_id, week_index)
);
-- Requête calendrier : « la semaine en cours de l'utilisateur ».
CREATE INDEX training_schedules_user_week_idx ON training_schedules (user_id, week_start DESC);

CREATE TABLE workout_sessions (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  schedule_id          UUID NOT NULL REFERENCES training_schedules(id) ON DELETE CASCADE,
  user_id              UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  discipline_id        TEXT NOT NULL REFERENCES disciplines(id),
  activity_type_id     TEXT REFERENCES activity_types(id),
  day                  weekday NOT NULL,
  title                TEXT NOT NULL,
  intensity            intensity_level NOT NULL,
  estimated_minutes    SMALLINT NOT NULL CHECK (estimated_minutes > 0),
  load_lower_body      SMALLINT NOT NULL CHECK (load_lower_body BETWEEN 0 AND 3),
  load_upper_body      SMALLINT NOT NULL CHECK (load_upper_body BETWEEN 0 AND 3),
  load_cardio          SMALLINT NOT NULL CHECK (load_cardio BETWEEN 0 AND 3),
  load_impact          SMALLINT NOT NULL CHECK (load_impact BETWEEN 0 AND 3),
  load_cns             SMALLINT NOT NULL CHECK (load_cns BETWEEN 0 AND 3),
  add_on               BOOLEAN NOT NULL DEFAULT false,
  status               planned_status NOT NULL DEFAULT 'planned',
  -- Remplacement automatique (fatigue/douleur) : traçable, sans pénalité.
  replaces_session_id  UUID REFERENCES workout_sessions(id) ON DELETE SET NULL,
  substitution_reason  TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK ((replaces_session_id IS NULL) = (substitution_reason IS NULL))
);
CREATE INDEX workout_sessions_schedule_day_idx ON workout_sessions (schedule_id, day);
CREATE INDEX workout_sessions_user_planned_idx ON workout_sessions (user_id) WHERE status = 'planned';

-- Bloc : colonnes typées, chaque format impose les siennes via CHECK.
CREATE TABLE workout_blocks (
  id                       BIGSERIAL PRIMARY KEY,
  session_id               UUID NOT NULL REFERENCES workout_sessions(id) ON DELETE CASCADE,
  position                 SMALLINT NOT NULL CHECK (position >= 0),
  kind                     block_kind NOT NULL,
  label                    TEXT,
  exercise_id              TEXT REFERENCES exercises(id),
  sets                     SMALLINT CHECK (sets > 0),
  reps_min                 SMALLINT CHECK (reps_min > 0),
  reps_max                 SMALLINT CHECK (reps_max > 0),
  per_side                 BOOLEAN NOT NULL DEFAULT false,
  load_type                load_type,
  load_value               NUMERIC(6,2) CHECK (load_value > 0),
  duration_sec             INTEGER CHECK (duration_sec > 0),
  distance_m               INTEGER CHECK (distance_m > 0),
  rest_sec                 INTEGER CHECK (rest_sec >= 0),
  repeats                  SMALLINT CHECK (repeats > 0),
  work_sec                 INTEGER CHECK (work_sec > 0),
  work_distance_m          INTEGER CHECK (work_distance_m > 0),
  rest_mode                rest_mode,
  rounds                   SMALLINT CHECK (rounds > 0),
  rest_between_moves_sec   INTEGER CHECK (rest_between_moves_sec >= 0),
  rest_between_rounds_sec  INTEGER CHECK (rest_between_rounds_sec >= 0),
  intensity                intensity_level,
  target_rpe               NUMERIC(3,1) CHECK (target_rpe BETWEEN 1 AND 10),
  target_pace_sec_per_km   INTEGER CHECK (target_pace_sec_per_km > 0),
  terrain                  terrain_type,
  focus                    TEXT,
  UNIQUE (session_id, position),
  CHECK (reps_min IS NULL OR reps_max IS NULL OR reps_min <= reps_max),
  CHECK ((load_type IS NULL) = (load_value IS NULL)),
  CHECK (load_type IS DISTINCT FROM 'rpe' OR load_value BETWEEN 1 AND 10),
  CHECK (
    CASE kind
      WHEN 'sets_reps'   THEN exercise_id IS NOT NULL AND sets IS NOT NULL AND reps_min IS NOT NULL AND rest_sec IS NOT NULL
      WHEN 'loaded_sets' THEN exercise_id IS NOT NULL AND sets IS NOT NULL AND reps_min IS NOT NULL AND load_type IS NOT NULL AND rest_sec IS NOT NULL
      WHEN 'timed'       THEN exercise_id IS NOT NULL AND duration_sec IS NOT NULL
      WHEN 'distance'    THEN exercise_id IS NOT NULL AND distance_m IS NOT NULL AND intensity IS NOT NULL
      WHEN 'intervals'   THEN exercise_id IS NOT NULL AND repeats IS NOT NULL AND rest_sec IS NOT NULL AND intensity IS NOT NULL
                              AND ((work_sec IS NULL) <> (work_distance_m IS NULL))
      WHEN 'circuit'     THEN rounds IS NOT NULL AND rest_between_moves_sec IS NOT NULL AND rest_between_rounds_sec IS NOT NULL
      WHEN 'emom'        THEN duration_sec IS NOT NULL AND duration_sec % 60 = 0
      WHEN 'amrap'       THEN duration_sec IS NOT NULL
      WHEN 'technique'   THEN duration_sec IS NOT NULL AND focus IS NOT NULL
      WHEN 'rest'        THEN duration_sec IS NOT NULL
      WHEN 'outdoor'     THEN exercise_id IS NOT NULL AND intensity IS NOT NULL AND (duration_sec IS NOT NULL OR distance_m IS NOT NULL)
      ELSE true  -- warmup / mobility / cooldown : contenu dans workout_block_items
    END
  )
);
CREATE INDEX workout_blocks_session_idx ON workout_blocks (session_id);

-- Le format du bloc doit être autorisé pour la discipline de la séance.
CREATE FUNCTION check_block_kind_allowed() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM workout_sessions s
      JOIN discipline_block_kinds k ON k.discipline_id = s.discipline_id AND k.block_kind = NEW.kind
     WHERE s.id = NEW.session_id
  ) THEN
    RAISE EXCEPTION 'block kind % not allowed for this discipline', NEW.kind;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER workout_blocks_kind_allowed BEFORE INSERT OR UPDATE OF kind, session_id ON workout_blocks
  FOR EACH ROW EXECUTE FUNCTION check_block_kind_allowed();

-- Mouvements d'un circuit/EMOM/AMRAP, ou items d'échauffement/mobilité/retour au calme.
CREATE TABLE workout_block_items (
  block_id      BIGINT NOT NULL REFERENCES workout_blocks(id) ON DELETE CASCADE,
  position      SMALLINT NOT NULL CHECK (position >= 0),
  exercise_id   TEXT NOT NULL REFERENCES exercises(id),
  reps          SMALLINT CHECK (reps > 0),
  duration_sec  INTEGER CHECK (duration_sec > 0),
  distance_m    INTEGER CHECK (distance_m > 0),
  load_type     load_type,
  load_value    NUMERIC(6,2) CHECK (load_value > 0),
  per_side      BOOLEAN NOT NULL DEFAULT false,
  PRIMARY KEY (block_id, position),
  CHECK ((reps IS NOT NULL)::int + (duration_sec IS NOT NULL)::int + (distance_m IS NOT NULL)::int = 1),
  CHECK ((load_type IS NULL) = (load_value IS NULL))
);

-- ═════════════════════════ Résultats et métriques ═════════════════════════
CREATE TABLE session_results (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  discipline_id       TEXT NOT NULL REFERENCES disciplines(id),
  planned_session_id  UUID REFERENCES workout_sessions(id) ON DELETE SET NULL,
  performed_on        DATE NOT NULL,
  started_at          TIMESTAMPTZ,
  status              result_status NOT NULL,
  duration_sec        INTEGER CHECK (duration_sec > 0),          -- NULL si non mesurée
  perceived_effort    SMALLINT CHECK (perceived_effort BETWEEN 1 AND 10),
  pain_reported       BOOLEAN NOT NULL DEFAULT false,
  notes               TEXT,
  -- Import / synchronisation (Apple Health, Health Connect, Strava, Garmin) et historiques antérieurs.
  external_provider   integration_provider,
  external_id         TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK ((external_provider IS NULL) = (external_id IS NULL)),
  CHECK (status <> 'skipped' OR duration_sec IS NULL)
);
CREATE UNIQUE INDEX session_results_external_uq ON session_results (user_id, external_provider, external_id) WHERE external_id IS NOT NULL;
-- Historique : liste chronologique, et filtrée par discipline.
CREATE INDEX session_results_user_date_idx ON session_results (user_id, performed_on DESC);
CREATE INDEX session_results_user_discipline_idx ON session_results (user_id, discipline_id, performed_on DESC);
-- Rapprochement des imports avec les séances de l'app (fenêtre de ±10 min sur started_at).
CREATE INDEX session_results_user_started_idx ON session_results (user_id, started_at) WHERE started_at IS NOT NULL;

-- Une ligne parente dont le modèle doit correspondre à celui de la discipline.
CREATE TABLE session_metrics (
  result_id     UUID PRIMARY KEY REFERENCES session_results(id) ON DELETE CASCADE,
  metric_model  metric_model NOT NULL,
  source        measurement_source NOT NULL DEFAULT 'manual'
);

CREATE FUNCTION check_metric_model() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE expected metric_model; st result_status;
BEGIN
  SELECT d.metric_model, r.status INTO expected, st
    FROM session_results r JOIN disciplines d ON d.id = r.discipline_id
   WHERE r.id = NEW.result_id;
  IF expected IS DISTINCT FROM NEW.metric_model THEN
    RAISE EXCEPTION 'metric model % incompatible with discipline (expected %)', NEW.metric_model, expected;
  END IF;
  IF st = 'skipped' THEN
    RAISE EXCEPTION 'a skipped session has no metrics';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER session_metrics_model_check BEFORE INSERT OR UPDATE ON session_metrics
  FOR EACH ROW EXECUTE FUNCTION check_metric_model();

-- Chaque table typée n'accepte que des lignes dont le parent porte le bon modèle.
CREATE FUNCTION check_metric_child(expected metric_model, rid UUID) RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT EXISTS (SELECT 1 FROM session_metrics WHERE result_id = rid AND metric_model = expected)
$$;

-- Musculation (resistance) et street workout (skill) : une ligne par série réalisée.
CREATE TABLE session_metric_sets (
  result_id               UUID NOT NULL REFERENCES session_metrics(result_id) ON DELETE CASCADE,
  position                SMALLINT NOT NULL CHECK (position >= 0),
  exercise_id             TEXT NOT NULL REFERENCES exercises(id),
  variation               TEXT,
  reps                    SMALLINT CHECK (reps > 0),
  hold_sec                INTEGER CHECK (hold_sec > 0),
  time_under_tension_sec  INTEGER CHECK (time_under_tension_sec > 0),
  load_kg                 NUMERIC(6,2) CHECK (load_kg >= 0),   -- NULL = charge non mesurée
  rpe                     NUMERIC(3,1) CHECK (rpe BETWEEN 1 AND 10),
  PRIMARY KEY (result_id, position),
  CHECK ((reps IS NULL) <> (hold_sec IS NULL)),
  CHECK (check_metric_child('resistance', result_id) OR check_metric_child('skill', result_id))
);
CREATE INDEX session_metric_sets_exercise_idx ON session_metric_sets (exercise_id);

CREATE TABLE session_metric_skills (
  result_id  UUID NOT NULL REFERENCES session_metrics(result_id) ON DELETE CASCADE,
  skill      TEXT NOT NULL,
  PRIMARY KEY (result_id, skill),
  CHECK (check_metric_child('skill', result_id))
);

CREATE TABLE session_metric_endurance (
  result_id         UUID PRIMARY KEY REFERENCES session_metrics(result_id) ON DELETE CASCADE,
  duration_sec      INTEGER NOT NULL CHECK (duration_sec > 0),
  moving_time_sec   INTEGER CHECK (moving_time_sec > 0),
  distance_m        INTEGER CHECK (distance_m > 0),
  elevation_gain_m  INTEGER CHECK (elevation_gain_m >= 0),
  elevation_loss_m  INTEGER CHECK (elevation_loss_m >= 0),
  avg_speed_kmh     NUMERIC(5,2) CHECK (avg_speed_kmh > 0),
  max_speed_kmh     NUMERIC(5,2) CHECK (max_speed_kmh > 0),
  avg_heart_rate    SMALLINT CHECK (avg_heart_rate BETWEEN 30 AND 240),
  max_heart_rate    SMALLINT CHECK (max_heart_rate BETWEEN 30 AND 240),
  CHECK (moving_time_sec IS NULL OR moving_time_sec <= duration_sec),
  CHECK (max_speed_kmh IS NULL OR avg_speed_kmh IS NULL OR max_speed_kmh >= avg_speed_kmh),
  CHECK (check_metric_child('endurance', result_id))
);

CREATE TABLE session_metric_splits (
  result_id         UUID NOT NULL REFERENCES session_metric_endurance(result_id) ON DELETE CASCADE,
  idx               SMALLINT NOT NULL CHECK (idx > 0),
  distance_m        NUMERIC(8,1) NOT NULL CHECK (distance_m > 0),
  duration_sec      NUMERIC(8,1) NOT NULL CHECK (duration_sec > 0),
  elevation_gain_m  INTEGER CHECK (elevation_gain_m >= 0),
  elevation_loss_m  INTEGER CHECK (elevation_loss_m >= 0),
  PRIMARY KEY (result_id, idx)
);

-- Trace GPS brute (points réellement enregistrés). Volumineux : purge possible sans perdre les métriques.
CREATE TABLE session_track_points (
  result_id    UUID NOT NULL REFERENCES session_results(id) ON DELETE CASCADE,
  seq          INTEGER NOT NULL CHECK (seq >= 0),
  recorded_at  TIMESTAMPTZ NOT NULL,
  lat          DOUBLE PRECISION NOT NULL CHECK (lat BETWEEN -90 AND 90),
  lon          DOUBLE PRECISION NOT NULL CHECK (lon BETWEEN -180 AND 180),
  altitude_m   REAL,
  accuracy_m   REAL CHECK (accuracy_m >= 0),
  PRIMARY KEY (result_id, seq)
);

CREATE TABLE session_metric_practice (
  result_id     UUID PRIMARY KEY REFERENCES session_metrics(result_id) ON DELETE CASCADE,
  duration_sec  INTEGER NOT NULL CHECK (duration_sec > 0),
  practices     TEXT[] NOT NULL CHECK (cardinality(practices) > 0),
  zones         body_zone[] NOT NULL DEFAULT '{}',
  CHECK (check_metric_child('practice', result_id))
);

CREATE TABLE session_metric_wod (
  result_id         UUID PRIMARY KEY REFERENCES session_metrics(result_id) ON DELETE CASCADE,
  format            wod_format NOT NULL,
  benchmark         TEXT,
  scaled            BOOLEAN NOT NULL DEFAULT false,
  duration_sec      INTEGER NOT NULL CHECK (duration_sec > 0),
  result_type       wod_result_type NOT NULL,
  result_seconds    INTEGER CHECK (result_seconds > 0),
  result_rounds     INTEGER CHECK (result_rounds >= 0),
  result_reps       INTEGER CHECK (result_reps >= 0),
  result_completed  INTEGER CHECK (result_completed >= 0),
  result_total      INTEGER CHECK (result_total > 0),
  CHECK (result_type <> 'time' OR result_seconds IS NOT NULL),
  CHECK (result_type <> 'rounds_reps' OR (result_rounds IS NOT NULL AND result_reps IS NOT NULL)),
  CHECK (result_type <> 'intervals_completed' OR (result_completed IS NOT NULL AND result_total IS NOT NULL AND result_completed <= result_total)),
  CHECK (format <> 'for_time' OR result_type = 'time'),
  CHECK (format <> 'amrap' OR result_type = 'rounds_reps'),
  CHECK (check_metric_child('wod', result_id))
);

CREATE TABLE session_metric_wod_movements (
  result_id    UUID NOT NULL REFERENCES session_metric_wod(result_id) ON DELETE CASCADE,
  position     SMALLINT NOT NULL CHECK (position >= 0),
  exercise_id  TEXT NOT NULL REFERENCES exercises(id),
  reps         SMALLINT CHECK (reps > 0),
  distance_m   INTEGER CHECK (distance_m > 0),
  load_kg      NUMERIC(6,2) CHECK (load_kg >= 0),
  PRIMARY KEY (result_id, position)
);

-- Records : historique complet, un seul record « courant » par clé comparable.
CREATE TABLE personal_records (
  id                 BIGSERIAL PRIMARY KEY,
  user_id            UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  record_key         TEXT NOT NULL,       -- ex : strength_training:back_squat:load@5
  discipline_id      TEXT NOT NULL REFERENCES disciplines(id),
  label              TEXT NOT NULL,
  value              NUMERIC(10,2) NOT NULL,
  unit               record_unit NOT NULL,
  better             record_direction NOT NULL,
  session_result_id  UUID NOT NULL REFERENCES session_results(id) ON DELETE CASCADE,
  achieved_on        DATE NOT NULL,
  is_current         BOOLEAN NOT NULL DEFAULT true
);
CREATE UNIQUE INDEX personal_records_current_idx ON personal_records (user_id, record_key) WHERE is_current;
CREATE INDEX personal_records_user_discipline_idx ON personal_records (user_id, discipline_id) WHERE is_current;

-- Agrégats hebdomadaires par discipline : NULL quand la mesure n'existe pas.
CREATE TABLE progression_metrics (
  user_id                UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  discipline_id          TEXT NOT NULL REFERENCES disciplines(id),
  week_start             DATE NOT NULL CHECK (extract(isodow FROM week_start) = 1),
  sessions_completed     SMALLINT NOT NULL DEFAULT 0 CHECK (sessions_completed >= 0),
  measured_duration_sec  INTEGER NOT NULL DEFAULT 0 CHECK (measured_duration_sec >= 0),
  total_distance_m       INTEGER CHECK (total_distance_m >= 0),
  total_tonnage_kg       NUMERIC(10,2) CHECK (total_tonnage_kg >= 0),
  total_reps             INTEGER CHECK (total_reps >= 0),
  PRIMARY KEY (user_id, discipline_id, week_start)
);

-- ═════════════════════════ Intégrations & synchronisation ═════════════════════════
-- Les jetons OAuth ne sont JAMAIS stockés ici : token_ref pointe vers un coffre (ex : Supabase Vault).
CREATE TABLE integration_connections (
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider        integration_provider NOT NULL,
  status          integration_status NOT NULL DEFAULT 'connected',
  scopes          TEXT[] NOT NULL DEFAULT '{}',
  can_read        BOOLEAN NOT NULL DEFAULT true,
  can_write       BOOLEAN NOT NULL DEFAULT false,
  token_ref       TEXT,
  sync_cursor     TEXT,
  last_synced_at  TIMESTAMPTZ,
  last_error      TEXT,
  connected_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, provider)
);

-- Exports déjà publiés vers un service (évite les doublons en cas de nouvelle tentative).
CREATE TABLE integration_exports (
  result_id    UUID NOT NULL REFERENCES session_results(id) ON DELETE CASCADE,
  provider     integration_provider NOT NULL,
  external_id  TEXT NOT NULL,
  exported_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (result_id, provider)
);

-- Idempotence de la synchronisation hors-ligne : chaque mutation de l'outbox n'est appliquée qu'une fois.
CREATE TABLE sync_mutations (
  id           UUID PRIMARY KEY,
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type         TEXT NOT NULL,
  client_seq   BIGINT NOT NULL CHECK (client_seq > 0),
  received_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX sync_mutations_user_idx ON sync_mutations (user_id, received_at DESC);

-- ═════════════════════════ Gamification ═════════════════════════
CREATE TABLE xp_events (
  id             TEXT PRIMARY KEY,                       -- clé d'idempotence
  user_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  occurred_on    DATE NOT NULL,
  amount         INTEGER NOT NULL CHECK (amount > 0),    -- jamais de retrait d'XP
  reason         xp_reason NOT NULL,
  discipline_id  TEXT REFERENCES disciplines(id),
  source_id      TEXT NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX xp_events_user_idx ON xp_events (user_id, occurred_on DESC);
CREATE INDEX xp_events_user_discipline_idx ON xp_events (user_id, discipline_id);

-- Même formule que l'application (gamification/engine.ts : xpForLevel).
CREATE FUNCTION xp_level(xp BIGINT) RETURNS INTEGER LANGUAGE sql IMMUTABLE AS $$
  SELECT max(l)::int FROM generate_series(1, 500) AS l WHERE round(100 * power(l - 1, 1.6)) <= xp
$$;

-- Statistiques agrégées par utilisateur (lecture rapide du profil).
CREATE TABLE user_gamification_stats (
  user_id                 UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  total_xp                BIGINT NOT NULL DEFAULT 0 CHECK (total_xp >= 0),
  global_level            INTEGER NOT NULL DEFAULT 1 CHECK (global_level >= 1),
  current_streak_weeks    INTEGER NOT NULL DEFAULT 0 CHECK (current_streak_weeks >= 0),
  longest_streak_weeks    INTEGER NOT NULL DEFAULT 0 CHECK (longest_streak_weeks >= current_streak_weeks),
  sessions_completed      INTEGER NOT NULL DEFAULT 0 CHECK (sessions_completed >= 0),
  personal_records_count  INTEGER NOT NULL DEFAULT 0 CHECK (personal_records_count >= 0),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Progression par discipline (barres distinctes).
CREATE TABLE user_discipline_xp (
  user_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  discipline_id  TEXT NOT NULL REFERENCES disciplines(id),
  xp             BIGINT NOT NULL DEFAULT 0 CHECK (xp >= 0),
  level          INTEGER NOT NULL DEFAULT 1 CHECK (level >= 1),
  PRIMARY KEY (user_id, discipline_id)
);

-- XP et niveaux maintenus par la base à chaque événement (l'app n'a pas à recalculer).
CREATE FUNCTION apply_xp_event() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO user_gamification_stats AS s (user_id, total_xp, global_level)
  VALUES (NEW.user_id, NEW.amount, xp_level(NEW.amount))
  ON CONFLICT (user_id) DO UPDATE
    SET total_xp = s.total_xp + NEW.amount, global_level = xp_level(s.total_xp + NEW.amount), updated_at = now();
  IF NEW.discipline_id IS NOT NULL THEN
    INSERT INTO user_discipline_xp AS d (user_id, discipline_id, xp, level)
    VALUES (NEW.user_id, NEW.discipline_id, NEW.amount, xp_level(NEW.amount))
    ON CONFLICT (user_id, discipline_id) DO UPDATE
      SET xp = d.xp + NEW.amount, level = xp_level(d.xp + NEW.amount);
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER xp_events_apply AFTER INSERT ON xp_events FOR EACH ROW EXECUTE FUNCTION apply_xp_event();

CREATE TABLE training_weeks (
  user_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  week_start     DATE NOT NULL CHECK (extract(isodow FROM week_start) = 1),
  planned        SMALLINT NOT NULL CHECK (planned >= 0),   -- hors séances remplacées pour raison de santé
  completed      SMALLINT NOT NULL CHECK (completed >= 0),
  recovery_week  BOOLEAN NOT NULL DEFAULT false,
  PRIMARY KEY (user_id, week_start)
);

CREATE TABLE achievements (
  id             TEXT PRIMARY KEY,
  title          TEXT NOT NULL,
  description    TEXT NOT NULL,
  badge_icon     TEXT NOT NULL,
  badge_tier     badge_tier NOT NULL,
  discipline_id  TEXT REFERENCES disciplines(id)
);

CREATE TABLE user_achievements (
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  achievement_id  TEXT NOT NULL REFERENCES achievements(id),
  earned_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, achievement_id)
);

CREATE TABLE user_quests (
  id                  TEXT NOT NULL,
  user_id             UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  scope               quest_scope NOT NULL,
  title               TEXT NOT NULL,
  xp                  SMALLINT NOT NULL CHECK (xp > 0),
  goal_type           quest_goal_type NOT NULL,
  goal_session_id     UUID REFERENCES workout_sessions(id) ON DELETE CASCADE,
  goal_ratio          NUMERIC(3,2) CHECK (goal_ratio > 0 AND goal_ratio <= 1),
  goal_count          SMALLINT CHECK (goal_count > 0),
  goal_discipline_id  TEXT REFERENCES disciplines(id),
  valid_from          DATE NOT NULL,
  valid_to            DATE NOT NULL CHECK (valid_to >= valid_from),
  completed_at        TIMESTAMPTZ,
  PRIMARY KEY (user_id, id),
  CHECK (goal_type <> 'complete_planned_session' OR goal_session_id IS NOT NULL),
  CHECK (goal_type <> 'complete_ratio_of_plan' OR goal_ratio IS NOT NULL),
  CHECK (goal_type <> 'practice_distinct_disciplines' OR goal_count IS NOT NULL),
  CHECK (goal_type <> 'complete_discipline' OR goal_discipline_id IS NOT NULL)
);
CREATE INDEX user_quests_open_idx ON user_quests (user_id, valid_to) WHERE completed_at IS NULL;

CREATE TABLE personal_challenges (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title          TEXT NOT NULL,
  metric         challenge_metric NOT NULL,
  discipline_id  TEXT REFERENCES disciplines(id),
  target         INTEGER NOT NULL CHECK (target > 0),
  starts_on      DATE NOT NULL,
  ends_on        DATE NOT NULL CHECK (ends_on >= starts_on),
  CHECK (metric <> 'distance_m' OR discipline_id IS NOT NULL)
);
