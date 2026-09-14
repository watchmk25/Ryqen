-- Durable start timestamps for foreground elapsed time in Today.
-- This migration preserves the existing Start transition's locking,
-- authorization, validation, and activity behavior.

ALTER TABLE public.actions
  ADD COLUMN started_at timestamptz;

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
