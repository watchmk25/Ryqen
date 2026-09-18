-- Ryqen V0.1 first-class Pause / Resume lifecycle.
--
-- Paused work is persistent lifecycle state, distinct from deferred work. It
-- remains anchored to its original plan item and can only return to active
-- work through the authenticated Resume RPC.

ALTER TABLE public.actions
  DROP CONSTRAINT actions_status_check,
  ADD CONSTRAINT actions_status_check
    CHECK (status IN ('pending', 'in_progress', 'paused', 'completed', 'cancelled', 'deferred'));

ALTER TABLE public.plan_items
  DROP CONSTRAINT plan_items_status_check,
  ADD CONSTRAINT plan_items_status_check
    CHECK (status IN ('pending', 'in_progress', 'paused', 'completed', 'skipped', 'deferred', 'replaced'));

ALTER TABLE public.activities
  DROP CONSTRAINT activities_type_check,
  ADD CONSTRAINT activities_type_check
    CHECK (type IN (
      'action_started',
      'action_paused',
      'action_resumed',
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

-- Keep the established lifecycle lock order: Action -> Daily Plan -> Plan Item.
CREATE OR REPLACE FUNCTION public.ryqen_pause_today_action(
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

  IF v_action.status <> 'in_progress' OR v_plan_item.status <> 'in_progress' THEN
    RAISE EXCEPTION 'Pause requires an in-progress action and plan item' USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.actions
  SET status = 'paused'
  WHERE id = v_action.id
  RETURNING * INTO v_action;
  UPDATE public.plan_items
  SET status = 'paused'
  WHERE id = v_plan_item.id
  RETURNING * INTO v_plan_item;

  INSERT INTO public.activities (user_id, action_id, task_id, type, metadata)
  VALUES (v_user_id, v_action.id, v_action.task_id, 'action_paused', jsonb_build_object('plan_item_id', v_plan_item.id));

  RETURN jsonb_build_object('action', to_jsonb(v_action), 'plan_item', to_jsonb(v_plan_item));
END;
$$;

CREATE OR REPLACE FUNCTION public.ryqen_resume_today_action(
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

  IF v_action.status <> 'paused' OR v_plan_item.status <> 'paused' THEN
    RAISE EXCEPTION 'Resume requires a paused action and plan item' USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.actions
  SET status = 'in_progress', started_at = now()
  WHERE id = v_action.id
  RETURNING * INTO v_action;
  UPDATE public.plan_items
  SET status = 'in_progress'
  WHERE id = v_plan_item.id
  RETURNING * INTO v_plan_item;

  INSERT INTO public.activities (user_id, action_id, task_id, type, metadata)
  VALUES (v_user_id, v_action.id, v_action.task_id, 'action_resumed', jsonb_build_object('plan_item_id', v_plan_item.id));

  RETURN jsonb_build_object('action', to_jsonb(v_action), 'plan_item', to_jsonb(v_plan_item));
END;
$$;

ALTER FUNCTION public.ryqen_pause_today_action(uuid, uuid) OWNER TO postgres;
ALTER FUNCTION public.ryqen_resume_today_action(uuid, uuid) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.ryqen_pause_today_action(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.ryqen_resume_today_action(uuid, uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.ryqen_pause_today_action(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ryqen_resume_today_action(uuid, uuid) TO authenticated;

-- Pause and Resume are required by the current Today client, so reject a
-- hosted backend that has not yet applied this migration before exposing UI
-- lifecycle controls.
CREATE OR REPLACE FUNCTION public.ryqen_today_backend_contract()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  RETURN jsonb_build_object('contract_version', 2);
END;
$$;

ALTER FUNCTION public.ryqen_today_backend_contract() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.ryqen_today_backend_contract() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ryqen_today_backend_contract() TO authenticated;
