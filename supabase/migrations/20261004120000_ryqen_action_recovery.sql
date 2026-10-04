-- Ryqen V0.1 Action Recovery / Lifecycle slice.
-- Cancelled Actions are retained permanently; cancelled_at governs only the
-- bounded user-facing restore window.

ALTER TABLE public.actions
  ADD COLUMN cancelled_at timestamptz,
  ADD CONSTRAINT actions_cancelled_at_requires_cancelled_status
    CHECK (cancelled_at IS NULL OR status = 'cancelled');

CREATE INDEX actions_user_id_recent_cancelled_idx
  ON public.actions (user_id, cancelled_at DESC, id DESC)
  WHERE status = 'cancelled' AND cancelled_at IS NOT NULL;

ALTER TABLE public.plan_items
  DROP CONSTRAINT plan_items_status_check,
  ADD CONSTRAINT plan_items_status_check
    CHECK (status IN ('pending', 'in_progress', 'paused', 'completed', 'skipped', 'deferred', 'cancelled', 'replaced'));

ALTER TABLE public.activities
  DROP CONSTRAINT activities_type_check,
  ADD CONSTRAINT activities_type_check
    CHECK (type IN (
      'action_started', 'action_paused', 'action_resumed', 'action_completed',
      'action_deferred', 'action_cancelled', 'action_restored', 'action_skipped',
      'task_started', 'task_completed', 'plan_item_started', 'plan_item_completed',
      'plan_item_skipped', 'goal_progress'
    ));

-- An Action is locked first. A supplied lifecycle anchor then locks its
-- Daily Plan and Plan Item in the established Action -> Daily Plan -> Plan
-- Item order. Pending inactive-parent work has no anchor and is still safely
-- cancellable by its owner.
CREATE OR REPLACE FUNCTION public.ryqen_cancel_action(
  p_action_id uuid,
  p_daily_plan_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_action public.actions%ROWTYPE;
  v_plan public.daily_plans%ROWTYPE;
  v_plan_item public.plan_items%ROWTYPE;
  v_session_end timestamptz;
  v_session_seconds bigint := 0;
  v_total_active_seconds bigint;
  v_metadata jsonb := '{}'::jsonb;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_action FROM public.actions
  WHERE id = p_action_id AND user_id = v_user_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Action not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_action.status NOT IN ('pending', 'in_progress', 'paused', 'deferred') THEN
    RAISE EXCEPTION 'Cancel requires a pending, in-progress, paused, or deferred action' USING ERRCODE = 'P0001';
  END IF;

  IF p_daily_plan_id IS NOT NULL THEN
    SELECT * INTO v_plan FROM public.daily_plans
    WHERE id = p_daily_plan_id AND user_id = v_user_id AND status = 'active'
    FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Lifecycle plan not found' USING ERRCODE = 'P0002';
    END IF;

    SELECT * INTO v_plan_item FROM public.plan_items
    WHERE daily_plan_id = v_plan.id AND action_id = v_action.id
    FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Lifecycle plan item not found' USING ERRCODE = 'P0002';
    END IF;

    IF v_plan_item.status <> v_action.status THEN
      RAISE EXCEPTION 'Cancel requires matching action and plan item states' USING ERRCODE = 'P0001';
    END IF;
    v_metadata := jsonb_build_object('plan_item_id', v_plan_item.id);
  ELSIF v_action.status IN ('in_progress', 'paused', 'deferred') THEN
    RAISE EXCEPTION 'A lifecycle plan item is required to cancel active, paused, or deferred work' USING ERRCODE = 'P0001';
  END IF;

  IF v_action.status = 'in_progress' AND v_action.started_at IS NOT NULL THEN
    v_session_end := LEAST(now(), (date_trunc('day', v_action.started_at AT TIME ZONE 'UTC') + interval '1 day') AT TIME ZONE 'UTC');
    v_session_seconds := GREATEST(0, floor(extract(epoch FROM v_session_end - v_action.started_at)))::bigint;
  END IF;
  v_total_active_seconds := v_action.accumulated_active_seconds + v_session_seconds;

  UPDATE public.actions
  SET status = 'cancelled',
      cancelled_at = now(),
      accumulated_active_seconds = v_total_active_seconds,
      started_at = NULL
  WHERE id = v_action.id
  RETURNING * INTO v_action;

  IF p_daily_plan_id IS NOT NULL THEN
    UPDATE public.plan_items SET status = 'cancelled'
    WHERE id = v_plan_item.id
    RETURNING * INTO v_plan_item;
  END IF;

  INSERT INTO public.activities (user_id, action_id, task_id, type, metadata)
  VALUES (v_user_id, v_action.id, v_action.task_id, 'action_cancelled', v_metadata);

  RETURN jsonb_build_object(
    'action', to_jsonb(v_action),
    'plan_item', CASE WHEN p_daily_plan_id IS NULL THEN NULL ELSE to_jsonb(v_plan_item) END
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.ryqen_restore_cancelled_action(
  p_action_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_action public.actions%ROWTYPE;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_action FROM public.actions
  WHERE id = p_action_id AND user_id = v_user_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Action not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_action.status <> 'cancelled' OR v_action.cancelled_at IS NULL THEN
    RAISE EXCEPTION 'Action is not available to restore' USING ERRCODE = 'P0001';
  END IF;
  IF now() > v_action.cancelled_at + interval '30 days' THEN
    RAISE EXCEPTION 'Cancelled action restore window has expired' USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.actions
  SET status = 'pending', cancelled_at = NULL, started_at = NULL
  WHERE id = v_action.id
  RETURNING * INTO v_action;

  INSERT INTO public.activities (user_id, action_id, task_id, type, metadata)
  VALUES (v_user_id, v_action.id, v_action.task_id, 'action_restored', '{}'::jsonb);

  RETURN to_jsonb(v_action);
END;
$$;

-- A same-day restore can reconcile its cancelled snapshot back to pending.
-- The Action has already been server-validated as pending by the existing
-- reconciliation eligibility contract, so this does not permit arbitrary
-- client lifecycle mutation.
CREATE OR REPLACE FUNCTION public.ryqen_reconcile_today_plan(
  p_daily_plan_id uuid,
  p_plan_date date,
  p_items jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid := auth.uid(); v_plan public.daily_plans%ROWTYPE; v_action public.actions%ROWTYPE;
  v_item jsonb; v_action_id uuid; v_position integer; v_priority_score numeric; v_rationale text; v_estimated_minutes integer;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501'; END IF;
  IF jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) > 3 THEN RAISE EXCEPTION 'Today plan reconciliation accepts at most three planner items' USING ERRCODE = 'P0001'; END IF;
  IF EXISTS (SELECT 1 FROM jsonb_to_recordset(p_items) AS item(action_id uuid, position integer, priority_score numeric, rationale text, estimated_minutes integer) GROUP BY action_id HAVING count(*) > 1) THEN RAISE EXCEPTION 'Planner items must not contain duplicate actions' USING ERRCODE = 'P0001'; END IF;
  IF EXISTS (SELECT 1 FROM jsonb_to_recordset(p_items) AS item(action_id uuid, position integer, priority_score numeric, rationale text, estimated_minutes integer) WHERE action_id IS NULL OR position IS NULL OR position < 1 OR position > 3 OR priority_score IS NULL OR priority_score < 0 OR estimated_minutes IS NULL OR estimated_minutes < 1) THEN RAISE EXCEPTION 'Invalid planner item snapshot' USING ERRCODE = 'P0001'; END IF;

  FOR v_action_id IN SELECT item.action_id FROM jsonb_to_recordset(p_items) AS item(action_id uuid) ORDER BY item.action_id LOOP
    SELECT * INTO v_action FROM public.actions WHERE id = v_action_id AND user_id = v_user_id FOR KEY SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Planner action not found' USING ERRCODE = 'P0002'; END IF;
    IF EXISTS (
      SELECT 1 FROM public.actions AS action
      LEFT JOIN public.tasks AS task ON task.id = action.task_id AND task.user_id = action.user_id
      LEFT JOIN public.projects AS action_project ON action_project.id = action.project_id AND action_project.user_id = action.user_id
      LEFT JOIN public.projects AS task_project ON task_project.id = task.project_id AND task_project.user_id = action.user_id
      LEFT JOIN public.goals AS action_goal ON action_goal.id = action.goal_id AND action_goal.user_id = action.user_id
      LEFT JOIN public.goals AS task_goal ON task_goal.id = task.goal_id AND task_goal.user_id = action.user_id
      LEFT JOIN public.goals AS action_project_goal ON action_project_goal.id = action_project.goal_id AND action_project_goal.user_id = action.user_id
      LEFT JOIN public.goals AS task_project_goal ON task_project_goal.id = task_project.goal_id AND task_project_goal.user_id = action.user_id
      WHERE action.id = v_action.id AND action.user_id = v_user_id AND (
        action.status <> 'pending'
        OR (action.task_id IS NOT NULL AND (task.id IS NULL OR task.status NOT IN ('pending', 'in_progress')))
        OR (action.project_id IS NOT NULL AND (action_project.id IS NULL OR action_project.status <> 'active'))
        OR (task.project_id IS NOT NULL AND (task_project.id IS NULL OR task_project.status <> 'active'))
        OR (action.goal_id IS NOT NULL AND (action_goal.id IS NULL OR action_goal.status <> 'active'))
        OR (task.goal_id IS NOT NULL AND (task_goal.id IS NULL OR task_goal.status <> 'active'))
        OR (action_project.goal_id IS NOT NULL AND (action_project_goal.id IS NULL OR action_project_goal.status <> 'active'))
        OR (task_project.goal_id IS NOT NULL AND (task_project_goal.id IS NULL OR task_project_goal.status <> 'active'))
      )
    ) THEN RAISE EXCEPTION 'Planner action is not eligible for a pending plan item' USING ERRCODE = 'P0001'; END IF;
  END LOOP;

  SELECT * INTO v_plan FROM public.daily_plans WHERE id = p_daily_plan_id AND user_id = v_user_id AND plan_date = p_plan_date AND status = 'active' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Active Today plan not found' USING ERRCODE = 'P0002'; END IF;
  FOR v_item IN SELECT value FROM jsonb_array_elements(p_items) LOOP
    v_action_id := (v_item ->> 'action_id')::uuid; v_position := (v_item ->> 'position')::integer; v_priority_score := (v_item ->> 'priority_score')::numeric; v_rationale := v_item ->> 'rationale'; v_estimated_minutes := (v_item ->> 'estimated_minutes')::integer;
    INSERT INTO public.plan_items (daily_plan_id, action_id, position, priority_score, rationale, estimated_minutes, status)
    VALUES (v_plan.id, v_action_id, v_position, v_priority_score, v_rationale, v_estimated_minutes, 'pending')
    ON CONFLICT (daily_plan_id, action_id) DO UPDATE SET position = EXCLUDED.position, priority_score = EXCLUDED.priority_score, rationale = EXCLUDED.rationale, estimated_minutes = EXCLUDED.estimated_minutes, status = CASE WHEN public.plan_items.status IN ('replaced', 'cancelled') THEN 'pending' ELSE public.plan_items.status END
    WHERE public.plan_items.status IN ('pending', 'replaced', 'cancelled');
  END LOOP;
  UPDATE public.plan_items SET status = 'replaced' WHERE daily_plan_id = v_plan.id AND status = 'pending' AND NOT EXISTS (SELECT 1 FROM jsonb_to_recordset(p_items) AS item(action_id uuid) WHERE item.action_id = public.plan_items.action_id);
END;
$$;

ALTER FUNCTION public.ryqen_cancel_action(uuid, uuid) OWNER TO postgres;
ALTER FUNCTION public.ryqen_restore_cancelled_action(uuid) OWNER TO postgres;
ALTER FUNCTION public.ryqen_reconcile_today_plan(uuid, date, jsonb) OWNER TO postgres;
ALTER FUNCTION public.ryqen_reconcile_today_plan(uuid, date, jsonb) SECURITY DEFINER;
ALTER FUNCTION public.ryqen_reconcile_today_plan(uuid, date, jsonb) SET search_path = '';
REVOKE ALL ON FUNCTION public.ryqen_cancel_action(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.ryqen_restore_cancelled_action(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ryqen_cancel_action(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ryqen_restore_cancelled_action(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.ryqen_today_backend_contract()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_user_id uuid := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501'; END IF;
  RETURN jsonb_build_object('contract_version', 5);
END;
$$;
ALTER FUNCTION public.ryqen_today_backend_contract() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.ryqen_today_backend_contract() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ryqen_today_backend_contract() TO authenticated;
