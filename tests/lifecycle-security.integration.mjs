import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import test from 'node:test'

const runLocalIntegration = process.env.RYQEN_RUN_LOCAL_SUPABASE_INTEGRATION === '1'

function runSql(sql) {
  return execFileSync(
    'docker',
    ['exec', '-i', 'supabase_db_Ryqen', 'psql', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1'],
    { input: sql, encoding: 'utf8' },
  )
}

test('local Supabase lifecycle hardening enforces client boundaries and preserves RPC workflows', { skip: !runLocalIntegration }, () => {
  const userA = '10000000-0000-0000-0000-000000000001'
  const userB = '10000000-0000-0000-0000-000000000002'
  const planA = '20000000-0000-0000-0000-000000000001'
  const planB = '20000000-0000-0000-0000-000000000002'
  const historicalPlan = '20000000-0000-0000-0000-000000000003'
  const actionA = '30000000-0000-0000-0000-000000000001'
  const actionB = '30000000-0000-0000-0000-000000000002'
  const actionDefer = '30000000-0000-0000-0000-000000000003'
  const actionSkip = '30000000-0000-0000-0000-000000000004'
  const actionReconsider = '30000000-0000-0000-0000-000000000005'
  const actionReplace = '30000000-0000-0000-0000-000000000006'
  const overnightAction = '30000000-0000-0000-0000-000000000007'
  const itemA = '40000000-0000-0000-0000-000000000001'
  const itemB = '40000000-0000-0000-0000-000000000002'
  const itemDefer = '40000000-0000-0000-0000-000000000003'
  const itemSkip = '40000000-0000-0000-0000-000000000004'
  const itemReconsider = '40000000-0000-0000-0000-000000000005'
  const itemReplace = '40000000-0000-0000-0000-000000000006'
  const overnightItem = '40000000-0000-0000-0000-000000000007'
  const otherActivity = '50000000-0000-0000-0000-000000000001'

  const output = runSql(`
BEGIN;

INSERT INTO auth.users (id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
VALUES
  ('${userA}', 'authenticated', 'authenticated', 'lifecycle-a@example.test', 'not-used', '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('${userB}', 'authenticated', 'authenticated', 'lifecycle-b@example.test', 'not-used', '{}'::jsonb, '{}'::jsonb, now(), now());

INSERT INTO public.daily_plans (id, user_id, plan_date, status, context_snapshot, generated_at)
VALUES
  ('${planA}', '${userA}', current_date, 'active', '{}'::jsonb, now()),
  ('${planB}', '${userB}', current_date, 'active', '{}'::jsonb, now()),
  ('${historicalPlan}', '${userA}', current_date - 1, 'active', '{}'::jsonb, now());

INSERT INTO public.actions (id, user_id, title, status, importance, estimated_minutes)
VALUES
  ('${actionA}', '${userA}', 'Start and complete', 'pending', 3, 15),
  ('${actionB}', '${userB}', 'Other user action', 'pending', 3, 15),
  ('${actionDefer}', '${userA}', 'Defer', 'pending', 3, 15),
  ('${actionSkip}', '${userA}', 'Skip', 'pending', 3, 15),
  ('${actionReconsider}', '${userA}', 'Reconsider', 'deferred', 3, 15),
  ('${actionReplace}', '${userA}', 'Replacement candidate', 'pending', 3, 15),
  ('${overnightAction}', '${userA}', 'Overnight work', 'in_progress', 3, 15);

INSERT INTO public.plan_items (id, daily_plan_id, action_id, position, priority_score, rationale, estimated_minutes, status)
VALUES
  ('${itemA}', '${planA}', '${actionA}', 1, 1, 'Lifecycle', 15, 'pending'),
  ('${itemB}', '${planB}', '${actionB}', 1, 1, 'Other user', 15, 'pending'),
  ('${itemDefer}', '${planA}', '${actionDefer}', 2, 1, 'Lifecycle', 15, 'pending'),
  ('${itemSkip}', '${planA}', '${actionSkip}', 3, 1, 'Lifecycle', 15, 'pending'),
  ('${itemReconsider}', '${planA}', '${actionReconsider}', 4, 1, 'Lifecycle', 15, 'deferred'),
  ('${itemReplace}', '${planA}', '${actionReplace}', 5, 1, 'Old recommendation', 15, 'pending'),
  ('${overnightItem}', '${historicalPlan}', '${overnightAction}', 1, 1, 'Historical lifecycle anchor', 15, 'in_progress');

INSERT INTO public.activities (id, user_id, action_id, type)
VALUES ('${otherActivity}', '${userB}', '${actionB}', 'action_started');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '${userA}', true);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.actions WHERE id = '${actionB}') THEN
    RAISE EXCEPTION 'cross-user Action SELECT leaked';
  END IF;
  IF EXISTS (SELECT 1 FROM public.plan_items WHERE id = '${itemB}') THEN
    RAISE EXCEPTION 'cross-user Plan Item SELECT leaked';
  END IF;
  IF EXISTS (SELECT 1 FROM public.activities WHERE id = '${otherActivity}') THEN
    RAISE EXCEPTION 'cross-user Activity SELECT leaked';
  END IF;
  BEGIN
    INSERT INTO public.actions (user_id, title, status, importance, estimated_minutes)
    VALUES ('${userA}', 'Bypass', 'pending', 3, 15);
    RAISE EXCEPTION 'direct Action INSERT unexpectedly succeeded';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    UPDATE public.actions SET status = 'completed' WHERE id = '${actionA}';
    RAISE EXCEPTION 'direct Action status UPDATE unexpectedly succeeded';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    UPDATE public.actions SET started_at = now() WHERE id = '${actionA}';
    RAISE EXCEPTION 'direct Action started_at UPDATE unexpectedly succeeded';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    UPDATE public.actions SET user_id = '${userB}' WHERE id = '${actionA}';
    RAISE EXCEPTION 'direct Action user_id UPDATE unexpectedly succeeded';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    DELETE FROM public.actions WHERE id = '${actionA}';
    RAISE EXCEPTION 'direct Action DELETE unexpectedly succeeded';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    INSERT INTO public.plan_items (daily_plan_id, action_id, position, priority_score, estimated_minutes, status)
    VALUES ('${planA}', '${actionA}', 6, 1, 15, 'completed');
    RAISE EXCEPTION 'direct Plan Item INSERT unexpectedly succeeded';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    UPDATE public.plan_items SET status = 'completed' WHERE id = '${itemA}';
    RAISE EXCEPTION 'direct Plan Item UPDATE unexpectedly succeeded';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    DELETE FROM public.plan_items WHERE id = '${itemA}';
    RAISE EXCEPTION 'direct Plan Item DELETE unexpectedly succeeded';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    INSERT INTO public.activities (user_id, type) VALUES ('${userA}', 'action_started');
    RAISE EXCEPTION 'direct Activity INSERT unexpectedly succeeded';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    UPDATE public.activities SET metadata = '{"forged": true}'::jsonb WHERE id = '${otherActivity}';
    RAISE EXCEPTION 'direct Activity UPDATE unexpectedly succeeded';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    DELETE FROM public.activities WHERE id = '${otherActivity}';
    RAISE EXCEPTION 'direct Activity DELETE unexpectedly succeeded';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    DELETE FROM public.daily_plans WHERE id = '${planA}';
    RAISE EXCEPTION 'direct Daily Plan DELETE unexpectedly succeeded';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END;
$$;

UPDATE public.actions SET title = 'Ordinary edit remains allowed' WHERE id = '${actionA}';
DO $$
BEGIN
  BEGIN
    PERFORM public.ryqen_start_today_action('${planB}', '${actionB}');
    RAISE EXCEPTION 'cross-user lifecycle RPC unexpectedly succeeded';
  EXCEPTION WHEN no_data_found THEN NULL;
  END;
  BEGIN
    PERFORM public.ryqen_capture_action(' ', 3::smallint, NULL::timestamptz, 30);
    RAISE EXCEPTION 'invalid capture title unexpectedly succeeded';
  EXCEPTION WHEN raise_exception THEN NULL;
  END;
  BEGIN
    PERFORM public.ryqen_capture_action('Invalid effort', 3::smallint, NULL::timestamptz, 0);
    RAISE EXCEPTION 'invalid capture effort unexpectedly succeeded';
  EXCEPTION WHEN raise_exception THEN NULL;
  END;
END;
$$;
SELECT public.ryqen_start_today_action('${planA}', '${actionA}');
DO $$
BEGIN
  IF (SELECT status FROM public.actions WHERE id = '${actionA}') <> 'in_progress'
    OR (SELECT status FROM public.plan_items WHERE id = '${itemA}') <> 'in_progress'
    OR (SELECT count(*) FROM public.activities WHERE action_id = '${actionA}') <> 2 THEN
    RAISE EXCEPTION 'Start RPC did not atomically create the expected lifecycle state';
  END IF;
  BEGIN
    PERFORM public.ryqen_start_today_action('${planA}', '${actionA}');
    RAISE EXCEPTION 'invalid repeat Start unexpectedly succeeded';
  EXCEPTION WHEN raise_exception THEN NULL;
  END;
  IF (SELECT count(*) FROM public.activities WHERE action_id = '${actionA}') <> 2 THEN
    RAISE EXCEPTION 'failed Start created duplicate activity';
  END IF;
END;
$$;
SELECT public.ryqen_complete_today_action('${planA}', '${actionA}');
SELECT public.ryqen_defer_today_action('${planA}', '${actionDefer}');
SELECT public.ryqen_skip_today_plan_item('${planA}', '${actionSkip}');
SELECT public.ryqen_reconsider_today_action('${planA}', '${actionReconsider}');
SELECT public.ryqen_capture_action('  Captured safely  ', 4::smallint, NULL::timestamptz, 30);
SELECT public.ryqen_reconcile_today_plan(
  '${planA}',
  current_date,
  jsonb_build_array(jsonb_build_object(
    'action_id', '${actionReconsider}',
    'position', 1,
    'priority_score', 9,
    'rationale', 'Planner snapshot',
    'estimated_minutes', 15,
    'status', 'completed'
  ))
);
DO $$
BEGIN
  IF (SELECT status FROM public.plan_items WHERE id = '${itemReconsider}') <> 'pending'
    OR (SELECT status FROM public.plan_items WHERE id = '${itemReplace}') <> 'replaced'
    OR (SELECT status FROM public.plan_items WHERE id = '${itemA}') <> 'completed'
    OR (SELECT status FROM public.plan_items WHERE id = '${itemSkip}') <> 'skipped'
    OR (SELECT status FROM public.actions WHERE id = '${actionSkip}') <> 'pending'
    OR (SELECT count(*) FROM public.actions WHERE title = 'Captured safely' AND user_id = '${userA}' AND status = 'pending') <> 1 THEN
    RAISE EXCEPTION 'RPC lifecycle or planner reconciliation invariant failed';
  END IF;
END;
$$;
SELECT public.ryqen_complete_today_action('${historicalPlan}', '${overnightAction}');
DO $$
BEGIN
  IF (SELECT status FROM public.actions WHERE id = '${overnightAction}') <> 'completed'
    OR (SELECT status FROM public.plan_items WHERE id = '${overnightItem}') <> 'completed'
    OR (SELECT plan_date FROM public.daily_plans WHERE id = '${historicalPlan}') <> current_date - 1 THEN
    RAISE EXCEPTION 'cross-day historical lifecycle anchor was not preserved';
  END IF;
END;
$$;

RESET ROLE;
SELECT set_config('request.jwt.claim.sub', '', true);
SET LOCAL ROLE anon;
DO $$
BEGIN
  BEGIN
    UPDATE public.actions SET title = 'anonymous bypass' WHERE id = '${actionA}';
    RAISE EXCEPTION 'anonymous direct Action mutation unexpectedly succeeded';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM public.ryqen_start_today_action('${planA}', '${actionA}');
    RAISE EXCEPTION 'anonymous lifecycle RPC unexpectedly succeeded';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END;
$$;

RESET ROLE;
DO $$
DECLARE
  v_function regprocedure;
BEGIN
  FOREACH v_function IN ARRAY ARRAY[
    'public.ryqen_start_today_action(uuid,uuid)'::regprocedure,
    'public.ryqen_complete_today_action(uuid,uuid)'::regprocedure,
    'public.ryqen_defer_today_action(uuid,uuid)'::regprocedure,
    'public.ryqen_skip_today_plan_item(uuid,uuid)'::regprocedure,
    'public.ryqen_reconsider_today_action(uuid,uuid)'::regprocedure,
    'public.ryqen_capture_action(text,smallint,timestamp with time zone)'::regprocedure,
    'public.ryqen_capture_action(text,smallint,timestamp with time zone,integer)'::regprocedure,
    'public.ryqen_reconcile_today_plan(uuid,date,jsonb)'::regprocedure
  ]
  LOOP
    IF NOT (SELECT prosecdef FROM pg_proc WHERE oid = v_function)
      OR NOT has_function_privilege('authenticated', v_function, 'EXECUTE')
      OR has_function_privilege('anon', v_function, 'EXECUTE') THEN
      RAISE EXCEPTION 'function privilege or security mode verification failed for %', v_function;
    END IF;
  END LOOP;
  IF has_table_privilege('authenticated', 'public.actions', 'INSERT')
    OR has_table_privilege('authenticated', 'public.actions', 'DELETE')
    OR has_column_privilege('authenticated', 'public.actions', 'status', 'UPDATE')
    OR has_column_privilege('authenticated', 'public.actions', 'started_at', 'UPDATE')
    OR has_column_privilege('authenticated', 'public.actions', 'user_id', 'UPDATE')
    OR has_table_privilege('authenticated', 'public.plan_items', 'INSERT')
    OR has_table_privilege('authenticated', 'public.plan_items', 'UPDATE')
    OR has_table_privilege('authenticated', 'public.plan_items', 'DELETE')
    OR has_table_privilege('authenticated', 'public.activities', 'INSERT')
    OR has_table_privilege('authenticated', 'public.activities', 'UPDATE')
    OR has_table_privilege('authenticated', 'public.activities', 'DELETE')
    OR has_table_privilege('authenticated', 'public.daily_plans', 'DELETE') THEN
    RAISE EXCEPTION 'direct mutation privilege remains';
  END IF;
END;
$$;

ROLLBACK;
`)

  assert.match(output, /ROLLBACK/)
})
