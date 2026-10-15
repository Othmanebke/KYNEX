-- Sécurité au niveau des lignes (Supabase / PostgREST).
--   * catalogue : lecture publique, écriture réservée au rôle de service ;
--   * données utilisateur : chacun ne voit et ne modifie que ses lignes (auth.uid()) ;
--   * gamification, records et dédoublonnage de synchro : lecture seule côté client,
--     écrits uniquement par le serveur (rôle de service, qui contourne la RLS) — l'XP ne
--     peut donc pas être forgée depuis l'application.

-- Hors Supabase (tests, PostgreSQL nu), on fournit une auth.uid() équivalente à celle de Supabase.
DO $$
BEGIN
  IF to_regprocedure('auth.uid()') IS NULL THEN
    CREATE SCHEMA IF NOT EXISTS auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
      $f$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $f$;
  END IF;
END $$;

-- ——— Catalogue : lecture pour tous ———
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'sports', 'disciplines', 'discipline_block_kinds', 'sport_goals', 'discipline_goals', 'activity_types',
    'environments', 'equipment', 'exercise_categories', 'exercises', 'exercise_disciplines', 'exercise_category_links',
    'exercise_goals', 'exercise_environments', 'exercise_muscles', 'exercise_equipment_options', 'exercise_equipment',
    'exercise_alternatives', 'exercise_assets', 'achievements'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY catalog_read ON %I FOR SELECT USING (true)', t);
  END LOOP;
END $$;

-- ——— Données utilisateur : lecture/écriture de ses propres lignes ———
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'training_profiles', 'user_disciplines', 'user_goals', 'user_equipment', 'user_environments', 'user_availability',
    'user_rest_days', 'user_pain_regions', 'user_excluded_exercises', 'workout_programs', 'training_schedules',
    'workout_sessions', 'session_results', 'progression_metrics', 'integration_connections', 'training_weeks',
    'user_quests', 'personal_challenges'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY owner_all ON %I FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid())', t);
  END LOOP;
END $$;

-- ——— Données dérivées : lecture seule pour l'utilisateur ———
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'xp_events', 'user_gamification_stats', 'user_discipline_xp', 'user_achievements', 'personal_records', 'sync_mutations'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY owner_read ON %I FOR SELECT USING (user_id = auth.uid())', t);
  END LOOP;
END $$;

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
CREATE POLICY self_read ON users FOR SELECT USING (id = auth.uid());

-- ——— Tables enfants : accès via la ligne parente ———
CREATE FUNCTION owns_session(sid UUID) RETURNS boolean LANGUAGE sql STABLE AS
  $$ SELECT EXISTS (SELECT 1 FROM workout_sessions WHERE id = sid AND user_id = auth.uid()) $$;
CREATE FUNCTION owns_block(bid BIGINT) RETURNS boolean LANGUAGE sql STABLE AS
  $$ SELECT EXISTS (SELECT 1 FROM workout_blocks b JOIN workout_sessions s ON s.id = b.session_id WHERE b.id = bid AND s.user_id = auth.uid()) $$;
CREATE FUNCTION owns_result(rid UUID) RETURNS boolean LANGUAGE sql STABLE AS
  $$ SELECT EXISTS (SELECT 1 FROM session_results WHERE id = rid AND user_id = auth.uid()) $$;

ALTER TABLE workout_blocks ENABLE ROW LEVEL SECURITY;
CREATE POLICY owner_all ON workout_blocks FOR ALL USING (owns_session(session_id)) WITH CHECK (owns_session(session_id));
ALTER TABLE workout_block_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY owner_all ON workout_block_items FOR ALL USING (owns_block(block_id)) WITH CHECK (owns_block(block_id));

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'session_metrics', 'session_metric_sets', 'session_metric_skills', 'session_metric_endurance', 'session_metric_splits',
    'session_track_points', 'session_metric_practice', 'session_metric_wod', 'session_metric_wod_movements', 'integration_exports'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY owner_all ON %I FOR ALL USING (owns_result(result_id)) WITH CHECK (owns_result(result_id))', t);
  END LOOP;
END $$;
