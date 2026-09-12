SET local check_function_bodies = off;

CREATE TABLE "public"."characters" (
  "id"                     uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "user_id"                uuid                     NOT NULL,
  "name"                   text                     DEFAULT 'Hunter'::text,
  "rank"                   text                     DEFAULT 'E'::text,
  "level"                  integer                  DEFAULT 1,
  "total_xp"               integer                  DEFAULT 0,
  "title"                  text                     DEFAULT 'Awakened One'::text,
  "str"                    integer                  DEFAULT 10,
  "int"                    integer                  DEFAULT 10,
  "vit"                    integer                  DEFAULT 10,
  "agi"                    integer                  DEFAULT 10,
  "endurance"              integer                  DEFAULT 10,
  "created_at"             timestamp with time zone DEFAULT now(),
  "last_quest_date"        date,
  "onboarding_complete"    boolean                  DEFAULT false,
  "total_quests_completed" integer                  DEFAULT 0,
  "current_streak"         integer                  DEFAULT 0,
  "longest_streak"         integer                  DEFAULT 0,
  "streak_shields"         integer                  DEFAULT 0,
  "streak_credited_date"   date,
  CONSTRAINT "characters_pkey" PRIMARY KEY (id),
  CONSTRAINT "characters_user_id_key" UNIQUE (user_id)
);

ALTER TABLE "public"."characters"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."focus_sessions" (
  "id"               uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "user_id"          uuid                     NOT NULL,
  "duration_minutes" integer                  NOT NULL,
  "type"             text                     DEFAULT 'meditation'::text,
  "completed_at"     timestamp with time zone DEFAULT now(),
  "date"             date                     DEFAULT CURRENT_DATE,
  CONSTRAINT "focus_sessions_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."focus_sessions"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."hunter_abilities" (
  "id"                     uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "user_id"                uuid                     NOT NULL,
  "pushups_max"            integer                  DEFAULT 0,
  "pullups_max"            integer                  DEFAULT 0,
  "squats_max"             integer                  DEFAULT 0,
  "plank_seconds"          integer                  DEFAULT 0,
  "deadlift_level"         text                     DEFAULT 'never'::text,
  "bench_level"            text                     DEFAULT 'never'::text,
  "martial_arts_level"     text                     DEFAULT 'never'::text,
  "rock_climbing_level"    text                     DEFAULT 'never'::text,
  "chess_level"            text                     DEFAULT 'never'::text,
  "coding_level"           text                     DEFAULT 'never'::text,
  "mathematics_level"      text                     DEFAULT 'never'::text,
  "reading_wpm"            integer                  DEFAULT 0,
  "languages_count"        integer                  DEFAULT 1,
  "instruments_level"      text                     DEFAULT 'never'::text,
  "memory_level"           text                     DEFAULT 'never'::text,
  "writing_level"          text                     DEFAULT 'never'::text,
  "running_km"             numeric                  DEFAULT 0,
  "diet_level"             text                     DEFAULT 'beginner'::text,
  "swimming_level"         text                     DEFAULT 'never'::text,
  "cycling_level"          text                     DEFAULT 'never'::text,
  "flexibility_level"      text                     DEFAULT 'never'::text,
  "sleep_level"            text                     DEFAULT 'beginner'::text,
  "breath_hold_seconds"    integer                  DEFAULT 0,
  "reaction_level"         text                     DEFAULT 'beginner'::text,
  "badminton_level"        text                     DEFAULT 'never'::text,
  "football_level"         text                     DEFAULT 'never'::text,
  "basketball_level"       text                     DEFAULT 'never'::text,
  "table_tennis_level"     text                     DEFAULT 'never'::text,
  "parkour_level"          text                     DEFAULT 'never'::text,
  "gymnastics_level"       text                     DEFAULT 'never'::text,
  "dancing_level"          text                     DEFAULT 'never'::text,
  "skateboarding_level"    text                     DEFAULT 'never'::text,
  "meditation_level"       text                     DEFAULT 'never'::text,
  "cold_shower_level"      text                     DEFAULT 'never'::text,
  "fasting_level"          text                     DEFAULT 'never'::text,
  "habit_streak_days"      integer                  DEFAULT 0,
  "focus_session_level"    text                     DEFAULT 'never'::text,
  "wakeup_level"           text                     DEFAULT 'beginner'::text,
  "journaling_level"       text                     DEFAULT 'never'::text,
  "pr_pushups"             integer                  DEFAULT 0,
  "pr_pullups"             integer                  DEFAULT 0,
  "pr_squats"              integer                  DEFAULT 0,
  "pr_plank_seconds"       integer                  DEFAULT 0,
  "pr_wall_sit_seconds"    integer                  DEFAULT 0,
  "pr_100m_seconds"        numeric                  DEFAULT 0,
  "pr_1km_seconds"         integer                  DEFAULT 0,
  "pr_5km_seconds"         integer                  DEFAULT 0,
  "pr_10km_seconds"        integer                  DEFAULT 0,
  "pr_marathon_minutes"    integer                  DEFAULT 0,
  "pr_bench_kg"            numeric                  DEFAULT 0,
  "pr_deadlift_kg"         numeric                  DEFAULT 0,
  "pr_squat_kg"            numeric                  DEFAULT 0,
  "pr_meditation_minutes"  integer                  DEFAULT 0,
  "pr_study_hours"         numeric                  DEFAULT 0,
  "pr_habit_streak"        integer                  DEFAULT 0,
  "pr_breath_hold_seconds" integer                  DEFAULT 0,
  "pr_fasting_hours"       integer                  DEFAULT 0,
  "assessment_complete"    boolean                  DEFAULT false,
  "created_at"             timestamp with time zone DEFAULT now(),
  CONSTRAINT "hunter_abilities_pkey" PRIMARY KEY (id),
  CONSTRAINT "hunter_abilities_user_id_key" UNIQUE (user_id)
);

ALTER TABLE "public"."hunter_abilities"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."hunter_profile" (
  "id"                      uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "user_id"                 uuid                     NOT NULL,
  "name"                    text                     NOT NULL DEFAULT 'Hunter'::text,
  "age"                     integer,
  "gender"                  text,
  "height_cm"               numeric,
  "weight_kg"               numeric,
  "profile_photo_url"       text,
  "primary_goal"            text,
  "activity_level"          text,
  "sleep_hours"             numeric,
  "weakest_area"            text,
  "occupation"              text,
  "workout_minutes"         integer,
  "equipment_access"        text,
  "specific_weaknesses"     text[],
  "medical_notes"           text,
  "onboarding_complete"     boolean                  DEFAULT false,
  "created_at"              timestamp with time zone DEFAULT now(),
  "dob"                     date,
  "daily_water_goal_ml"     integer                  DEFAULT 2500,
  "last_meditation_minutes" integer                  DEFAULT 10,
  "last_focus_minutes"      integer                  DEFAULT 10,
  "notifications_enabled"   boolean                  DEFAULT true,
  "reminder_hour"           integer                  DEFAULT 20,
  "reminder_minute"         integer                  DEFAULT 0,
  CONSTRAINT "hunter_profile_pkey" PRIMARY KEY (id),
  CONSTRAINT "hunter_profile_user_id_key" UNIQUE (user_id)
);

ALTER TABLE "public"."hunter_profile"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."quests" (
  "id"         uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "user_id"    uuid                     NOT NULL,
  "title"      text                     NOT NULL,
  "difficulty" text                     NOT NULL,
  "xp"         integer                  NOT NULL,
  "stat"       text                     NOT NULL,
  "status"     text                     DEFAULT 'available'::text,
  "date"       date                     DEFAULT CURRENT_DATE,
  "created_at" timestamp with time zone DEFAULT now(),
  CONSTRAINT "quests_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."quests"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."saved_timers" (
  "id"         uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "user_id"    uuid                     NOT NULL,
  "label"      text                     NOT NULL,
  "type"       text                     DEFAULT 'meditation'::text,
  "hours"      integer                  DEFAULT 0,
  "minutes"    integer                  DEFAULT 10,
  "seconds"    integer                  DEFAULT 0,
  "is_default" boolean                  DEFAULT false,
  "created_at" timestamp with time zone DEFAULT now(),
  CONSTRAINT "saved_timers_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."saved_timers"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."water_logs" (
  "id"        uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "user_id"   uuid                     NOT NULL,
  "amount_ml" integer                  NOT NULL,
  "logged_at" timestamp with time zone DEFAULT now(),
  "date"      date                     DEFAULT CURRENT_DATE,
  CONSTRAINT "water_logs_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."water_logs"
  ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.rls_auto_enable()
  RETURNS event_trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'pg_catalog'
  AS $function$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$function$;

ALTER TABLE "public"."characters"
  ADD CONSTRAINT "characters_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE "public"."focus_sessions"
  ADD CONSTRAINT "focus_sessions_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE "public"."hunter_abilities"
  ADD CONSTRAINT "hunter_abilities_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE "public"."hunter_profile"
  ADD CONSTRAINT "hunter_profile_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE "public"."quests"
  ADD CONSTRAINT "quests_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE "public"."saved_timers"
  ADD CONSTRAINT "saved_timers_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE "public"."water_logs"
  ADD CONSTRAINT "water_logs_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

CREATE POLICY "own character" ON "public"."characters"
  FOR ALL
  TO PUBLIC
  USING ((auth.uid() = user_id));

CREATE POLICY "own focus sessions" ON "public"."focus_sessions"
  FOR ALL
  TO PUBLIC
  USING ((auth.uid() = user_id));

CREATE POLICY "own abilities" ON "public"."hunter_abilities"
  FOR ALL
  TO PUBLIC
  USING ((auth.uid() = user_id));

CREATE POLICY "own profile" ON "public"."hunter_profile"
  FOR ALL
  TO PUBLIC
  USING ((auth.uid() = user_id));

CREATE POLICY "own quests" ON "public"."quests"
  FOR ALL
  TO PUBLIC
  USING ((auth.uid() = user_id));

CREATE POLICY "own saved timers" ON "public"."saved_timers"
  FOR ALL
  TO PUBLIC
  USING ((auth.uid() = user_id));

CREATE POLICY "own water logs" ON "public"."water_logs"
  FOR ALL
  TO PUBLIC
  USING ((auth.uid() = user_id));

CREATE POLICY "avatars are publicly viewable" ON "storage"."objects"
  FOR SELECT
  TO PUBLIC
  USING ((bucket_id = 'avatars'::text));

CREATE POLICY "users can update their own avatar" ON "storage"."objects"
  FOR UPDATE
  TO PUBLIC
  WITH CHECK (((bucket_id = 'avatars'::text) AND ((auth.uid())::text = (storage.foldername(name))[1])));

CREATE POLICY "users can upload their own avatar" ON "storage"."objects"
  FOR INSERT
  TO PUBLIC
  WITH CHECK (((bucket_id = 'avatars'::text) AND ((auth.uid())::text = (storage.foldername(name))[1])));

CREATE EVENT TRIGGER "ensure_rls"
  ON ddl_command_end
  WHEN TAG IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
  EXECUTE FUNCTION "public"."rls_auto_enable"();

GRANT EXECUTE ON FUNCTION "public"."rls_auto_enable"() TO PUBLIC, "anon", "authenticated", "postgres", "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."characters" TO "anon", "authenticated", "postgres", "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."focus_sessions" TO "anon", "authenticated", "postgres", "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."hunter_abilities" TO "anon", "authenticated", "postgres", "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."hunter_profile" TO "anon", "authenticated", "postgres", "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."quests" TO "anon", "authenticated", "postgres", "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."saved_timers" TO "anon", "authenticated", "postgres", "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."water_logs" TO "anon", "authenticated", "postgres", "service_role";

