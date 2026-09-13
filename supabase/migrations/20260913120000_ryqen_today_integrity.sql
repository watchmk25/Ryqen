-- Integrity additions for the Ryqen V0.1 Today command center.
-- This migration is additive and leaves all Hunter-era tables untouched.

ALTER TABLE public.plan_items
  DROP CONSTRAINT plan_items_status_check,
  ADD CONSTRAINT plan_items_status_check
    CHECK (status IN ('pending', 'in_progress', 'completed', 'skipped', 'deferred', 'replaced')),
  ADD CONSTRAINT plan_items_daily_plan_id_action_id_key UNIQUE (daily_plan_id, action_id);

ALTER TABLE public.activities
  DROP CONSTRAINT activities_type_check,
  ADD CONSTRAINT activities_type_check
    CHECK (type IN (
      'action_started',
      'action_completed',
      'action_deferred',
      'action_skipped',
      'task_started',
      'task_completed',
      'plan_item_started',
      'plan_item_completed',
      'plan_item_skipped',
      'goal_progress'
    ));

CREATE OR REPLACE FUNCTION public.ryqen_start_today_action(
  p_daily_plan_id uuid,
  p_action_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_action public.actions%ROWTYPE;
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

  SELECT plan_items.* INTO v_plan_item
  FROM public.plan_items
  JOIN public.daily_plans ON daily_plans.id = plan_items.daily_plan_id
  WHERE plan_items.daily_plan_id = p_daily_plan_id
    AND plan_items.action_id = p_action_id
    AND daily_plans.user_id = v_user_id
    AND daily_plans.status = 'active'
  FOR UPDATE OF plan_items, daily_plans;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Active Today plan item not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_action.status <> 'pending' OR v_plan_item.status <> 'pending' THEN
    RAISE EXCEPTION 'Start requires a pending action and pending plan item' USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.actions SET status = 'in_progress' WHERE id = v_action.id RETURNING * INTO v_action;
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
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_action public.actions%ROWTYPE;
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

  SELECT plan_items.* INTO v_plan_item
  FROM public.plan_items
  JOIN public.daily_plans ON daily_plans.id = plan_items.daily_plan_id
  WHERE plan_items.daily_plan_id = p_daily_plan_id
    AND plan_items.action_id = p_action_id
    AND daily_plans.user_id = v_user_id
    AND daily_plans.status = 'active'
  FOR UPDATE OF plan_items, daily_plans;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Active Today plan item not found' USING ERRCODE = 'P0002';
  END IF;

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
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_action public.actions%ROWTYPE;
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

  SELECT plan_items.* INTO v_plan_item
  FROM public.plan_items
  JOIN public.daily_plans ON daily_plans.id = plan_items.daily_plan_id
  WHERE plan_items.daily_plan_id = p_daily_plan_id
    AND plan_items.action_id = p_action_id
    AND daily_plans.user_id = v_user_id
    AND daily_plans.status = 'active'
  FOR UPDATE OF plan_items, daily_plans;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Active Today plan item not found' USING ERRCODE = 'P0002';
  END IF;

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
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_action public.actions%ROWTYPE;
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

  SELECT plan_items.* INTO v_plan_item
  FROM public.plan_items
  JOIN public.daily_plans ON daily_plans.id = plan_items.daily_plan_id
  WHERE plan_items.daily_plan_id = p_daily_plan_id
    AND plan_items.action_id = p_action_id
    AND daily_plans.user_id = v_user_id
    AND daily_plans.status = 'active'
  FOR UPDATE OF plan_items, daily_plans;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Active Today plan item not found' USING ERRCODE = 'P0002';
  END IF;

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
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_action public.actions%ROWTYPE;
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

  SELECT plan_items.* INTO v_plan_item
  FROM public.plan_items
  JOIN public.daily_plans ON daily_plans.id = plan_items.daily_plan_id
  WHERE plan_items.daily_plan_id = p_daily_plan_id
    AND plan_items.action_id = p_action_id
    AND daily_plans.user_id = v_user_id
    AND daily_plans.status = 'active'
  FOR UPDATE OF plan_items, daily_plans;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Active Today plan item not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_action.status <> 'deferred' OR v_plan_item.status <> 'deferred' THEN
    RAISE EXCEPTION 'Reconsider requires a deferred action and deferred plan item' USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.actions SET status = 'pending' WHERE id = v_action.id RETURNING * INTO v_action;
  UPDATE public.plan_items SET status = 'pending' WHERE id = v_plan_item.id RETURNING * INTO v_plan_item;

  RETURN jsonb_build_object('action', to_jsonb(v_action), 'plan_item', to_jsonb(v_plan_item));
END;
$$;

REVOKE EXECUTE ON FUNCTION public.ryqen_start_today_action(uuid, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.ryqen_complete_today_action(uuid, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.ryqen_defer_today_action(uuid, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.ryqen_skip_today_plan_item(uuid, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.ryqen_reconsider_today_action(uuid, uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.ryqen_start_today_action(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ryqen_complete_today_action(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ryqen_defer_today_action(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ryqen_skip_today_plan_item(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ryqen_reconsider_today_action(uuid, uuid) TO authenticated;
