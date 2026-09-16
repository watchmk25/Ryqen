-- Ryqen V0.1 lifecycle/reconciliation lock-order stabilization.
--
-- Every RPC that may touch the same work now locks in this order:
--   1. Action
--   2. Daily Plan
--   3. Plan Item
--
-- This is deliberately additive: it replaces only function bodies from
-- already-applied migrations. SECURITY DEFINER, the empty search_path,
-- explicit auth.uid() checks, and existing transition semantics are retained.

CREATE OR REPLACE FUNCTION public.ryqen_start_today_action(
  p_daily_plan_id uuid,
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
  v_plan public.daily_plans%ROWTYPE;
  v_plan_item public.plan_items%ROWTYPE;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_action
  FROM public.actions
  WHERE id = p_action_id AND user_id = v_user_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Action not found' USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO v_plan
  FROM public.daily_plans
  WHERE id = p_daily_plan_id AND user_id = v_user_id AND status = 'active'
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Active Today plan item not found' USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO v_plan_item
  FROM public.plan_items
  WHERE daily_plan_id = v_plan.id AND action_id = v_action.id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Active Today plan item not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_action.status <> 'pending' OR v_plan_item.status <> 'pending' THEN
    RAISE EXCEPTION 'Start requires a pending action and pending plan item' USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.actions
  SET status = 'in_progress', started_at = now()
  WHERE id = v_action.id
  RETURNING * INTO v_action;
  UPDATE public.plan_items SET status = 'in_progress' WHERE id = v_plan_item.id RETURNING * INTO v_plan_item;

  INSERT INTO public.activities (user_id, action_id, task_id, type, metadata)
  VALUES
    (v_user_id, v_action.id, v_action.task_id, 'action_started', jsonb_build_object('plan_item_id', v_plan_item.id)),
    (v_user_id, v_action.id, v_action.task_id, 'plan_item_started', jsonb_build_object('plan_item_id', v_plan_item.id));

  RETURN jsonb_build_object('action', to_jsonb(v_action), 'plan_item', to_jsonb(v_plan_item));
END;
$$;

CREATE OR REPLACE FUNCTION public.ryqen_complete_today_action(
  p_daily_plan_id uuid,
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
  v_plan public.daily_plans%ROWTYPE;
  v_plan_item public.plan_items%ROWTYPE;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_action FROM public.actions
  WHERE id = p_action_id AND user_id = v_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Action not found' USING ERRCODE = 'P0002'; END IF;

  SELECT * INTO v_plan FROM public.daily_plans
  WHERE id = p_daily_plan_id AND user_id = v_user_id AND status = 'active' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Active Today plan item not found' USING ERRCODE = 'P0002'; END IF;

  SELECT * INTO v_plan_item FROM public.plan_items
  WHERE daily_plan_id = v_plan.id AND action_id = v_action.id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Active Today plan item not found' USING ERRCODE = 'P0002'; END IF;

  IF v_action.status <> 'in_progress' OR v_plan_item.status <> 'in_progress' THEN
    RAISE EXCEPTION 'Complete requires an in-progress action and plan item' USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.actions SET status = 'completed' WHERE id = v_action.id RETURNING * INTO v_action;
  UPDATE public.plan_items SET status = 'completed' WHERE id = v_plan_item.id RETURNING * INTO v_plan_item;

  INSERT INTO public.activities (user_id, action_id, task_id, type, metadata)
  VALUES
    (v_user_id, v_action.id, v_action.task_id, 'action_completed', jsonb_build_object('plan_item_id', v_plan_item.id)),
    (v_user_id, v_action.id, v_action.task_id, 'plan_item_completed', jsonb_build_object('plan_item_id', v_plan_item.id));

  RETURN jsonb_build_object('action', to_jsonb(v_action), 'plan_item', to_jsonb(v_plan_item));
END;
$$;

CREATE OR REPLACE FUNCTION public.ryqen_defer_today_action(
  p_daily_plan_id uuid,
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
  v_plan public.daily_plans%ROWTYPE;
  v_plan_item public.plan_items%ROWTYPE;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501'; END IF;

  SELECT * INTO v_action FROM public.actions
  WHERE id = p_action_id AND user_id = v_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Action not found' USING ERRCODE = 'P0002'; END IF;

  SELECT * INTO v_plan FROM public.daily_plans
  WHERE id = p_daily_plan_id AND user_id = v_user_id AND status = 'active' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Active Today plan item not found' USING ERRCODE = 'P0002'; END IF;

  SELECT * INTO v_plan_item FROM public.plan_items
  WHERE daily_plan_id = v_plan.id AND action_id = v_action.id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Active Today plan item not found' USING ERRCODE = 'P0002'; END IF;

  IF NOT (
    (v_action.status = 'pending' AND v_plan_item.status = 'pending')
    OR (v_action.status = 'in_progress' AND v_plan_item.status = 'in_progress')
  ) THEN
    RAISE EXCEPTION 'Defer requires matching pending or in-progress action and plan item states' USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.actions SET status = 'deferred' WHERE id = v_action.id RETURNING * INTO v_action;
  UPDATE public.plan_items SET status = 'deferred' WHERE id = v_plan_item.id RETURNING * INTO v_plan_item;

  INSERT INTO public.activities (user_id, action_id, task_id, type, metadata)
  VALUES (v_user_id, v_action.id, v_action.task_id, 'action_deferred', jsonb_build_object('plan_item_id', v_plan_item.id));

  RETURN jsonb_build_object('action', to_jsonb(v_action), 'plan_item', to_jsonb(v_plan_item));
END;
$$;

CREATE OR REPLACE FUNCTION public.ryqen_skip_today_plan_item(
  p_daily_plan_id uuid,
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
  v_plan public.daily_plans%ROWTYPE;
  v_plan_item public.plan_items%ROWTYPE;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501'; END IF;

  SELECT * INTO v_action FROM public.actions
  WHERE id = p_action_id AND user_id = v_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Action not found' USING ERRCODE = 'P0002'; END IF;

  SELECT * INTO v_plan FROM public.daily_plans
  WHERE id = p_daily_plan_id AND user_id = v_user_id AND status = 'active' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Active Today plan item not found' USING ERRCODE = 'P0002'; END IF;

  SELECT * INTO v_plan_item FROM public.plan_items
  WHERE daily_plan_id = v_plan.id AND action_id = v_action.id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Active Today plan item not found' USING ERRCODE = 'P0002'; END IF;

  IF v_action.status <> 'pending' OR v_plan_item.status <> 'pending' THEN
    RAISE EXCEPTION 'Skip requires a pending action and pending plan item' USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.plan_items SET status = 'skipped' WHERE id = v_plan_item.id RETURNING * INTO v_plan_item;

  INSERT INTO public.activities (user_id, action_id, task_id, type, metadata)
  VALUES (v_user_id, v_action.id, v_action.task_id, 'plan_item_skipped', jsonb_build_object('plan_item_id', v_plan_item.id));

  RETURN jsonb_build_object('action', to_jsonb(v_action), 'plan_item', to_jsonb(v_plan_item));
END;
$$;

CREATE OR REPLACE FUNCTION public.ryqen_reconsider_today_action(
  p_daily_plan_id uuid,
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
  v_plan public.daily_plans%ROWTYPE;
  v_plan_item public.plan_items%ROWTYPE;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501'; END IF;

  SELECT * INTO v_action FROM public.actions
  WHERE id = p_action_id AND user_id = v_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Action not found' USING ERRCODE = 'P0002'; END IF;

  SELECT * INTO v_plan FROM public.daily_plans
  WHERE id = p_daily_plan_id AND user_id = v_user_id AND status = 'active' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Active Today plan item not found' USING ERRCODE = 'P0002'; END IF;

  SELECT * INTO v_plan_item FROM public.plan_items
  WHERE daily_plan_id = v_plan.id AND action_id = v_action.id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Active Today plan item not found' USING ERRCODE = 'P0002'; END IF;

  IF v_action.status <> 'deferred' OR v_plan_item.status <> 'deferred' THEN
    RAISE EXCEPTION 'Reconsider requires a deferred action and deferred plan item' USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.actions SET status = 'pending' WHERE id = v_action.id RETURNING * INTO v_action;
  UPDATE public.plan_items SET status = 'pending' WHERE id = v_plan_item.id RETURNING * INTO v_plan_item;

  RETURN jsonb_build_object('action', to_jsonb(v_action), 'plan_item', to_jsonb(v_plan_item));
END;
$$;

-- Validate the complete planner payload first. Then acquire all Action locks
-- in a stable order before the Daily Plan lock. Upserts/replacements lock
-- Plan Items only after those two parent resources are held.
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
  v_user_id uuid := auth.uid();
  v_plan public.daily_plans%ROWTYPE;
  v_item jsonb;
  v_action_id uuid;
  v_position integer;
  v_priority_score numeric;
  v_rationale text;
  v_estimated_minutes integer;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  IF jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) > 3 THEN
    RAISE EXCEPTION 'Today plan reconciliation accepts at most three planner items' USING ERRCODE = 'P0001';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_to_recordset(p_items) AS item(
      action_id uuid, position integer, priority_score numeric, rationale text, estimated_minutes integer
    )
    GROUP BY action_id
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Planner items must not contain duplicate actions' USING ERRCODE = 'P0001';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_to_recordset(p_items) AS item(
      action_id uuid, position integer, priority_score numeric, rationale text, estimated_minutes integer
    )
    WHERE action_id IS NULL
      OR position IS NULL OR position < 1 OR position > 3
      OR priority_score IS NULL OR priority_score < 0
      OR estimated_minutes IS NULL OR estimated_minutes < 1
  ) THEN
    RAISE EXCEPTION 'Invalid planner item snapshot' USING ERRCODE = 'P0001';
  END IF;

  FOR v_action_id IN
    SELECT item.action_id
    FROM jsonb_to_recordset(p_items) AS item(action_id uuid)
    ORDER BY item.action_id
  LOOP
    PERFORM 1
    FROM public.actions
    WHERE id = v_action_id AND user_id = v_user_id
    FOR KEY SHARE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Planner action not found' USING ERRCODE = 'P0002';
    END IF;
  END LOOP;

  SELECT * INTO v_plan
  FROM public.daily_plans
  WHERE id = p_daily_plan_id
    AND user_id = v_user_id
    AND plan_date = p_plan_date
    AND status = 'active'
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Active Today plan not found' USING ERRCODE = 'P0002';
  END IF;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_items)
  LOOP
    v_action_id := (v_item ->> 'action_id')::uuid;
    v_position := (v_item ->> 'position')::integer;
    v_priority_score := (v_item ->> 'priority_score')::numeric;
    v_rationale := v_item ->> 'rationale';
    v_estimated_minutes := (v_item ->> 'estimated_minutes')::integer;

    INSERT INTO public.plan_items (
      daily_plan_id, action_id, position, priority_score, rationale, estimated_minutes, status
    ) VALUES (
      v_plan.id, v_action_id, v_position, v_priority_score, v_rationale, v_estimated_minutes, 'pending'
    )
    ON CONFLICT (daily_plan_id, action_id) DO UPDATE
    SET
      position = EXCLUDED.position,
      priority_score = EXCLUDED.priority_score,
      rationale = EXCLUDED.rationale,
      estimated_minutes = EXCLUDED.estimated_minutes,
      status = CASE WHEN public.plan_items.status = 'replaced' THEN 'pending' ELSE public.plan_items.status END
    WHERE public.plan_items.status IN ('pending', 'replaced');
  END LOOP;

  UPDATE public.plan_items
  SET status = 'replaced'
  WHERE daily_plan_id = v_plan.id
    AND status = 'pending'
    AND NOT EXISTS (
      SELECT 1
      FROM jsonb_to_recordset(p_items) AS item(action_id uuid)
      WHERE item.action_id = public.plan_items.action_id
    );
END;
$$;

ALTER FUNCTION public.ryqen_start_today_action(uuid, uuid) OWNER TO postgres;
ALTER FUNCTION public.ryqen_complete_today_action(uuid, uuid) OWNER TO postgres;
ALTER FUNCTION public.ryqen_defer_today_action(uuid, uuid) OWNER TO postgres;
ALTER FUNCTION public.ryqen_skip_today_plan_item(uuid, uuid) OWNER TO postgres;
ALTER FUNCTION public.ryqen_reconsider_today_action(uuid, uuid) OWNER TO postgres;
ALTER FUNCTION public.ryqen_reconcile_today_plan(uuid, date, jsonb) OWNER TO postgres;
