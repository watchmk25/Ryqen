-- Preserve the historical plan-item timing snapshot without representing an
-- absent target as JSON null in immutable completion metadata.
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
  v_session_end timestamptz;
  v_session_seconds bigint := 0;
  v_total_active_seconds bigint;
  v_completion_metadata jsonb;
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

  IF v_action.status <> 'in_progress' OR v_plan_item.status <> 'in_progress' THEN
    RAISE EXCEPTION 'Complete requires an in-progress action and plan item' USING ERRCODE = 'P0001';
  END IF;

  IF v_action.started_at IS NOT NULL THEN
    v_session_end := LEAST(now(), (date_trunc('day', v_action.started_at AT TIME ZONE 'UTC') + interval '1 day') AT TIME ZONE 'UTC');
    v_session_seconds := GREATEST(0, floor(extract(epoch FROM v_session_end - v_action.started_at)))::bigint;
  END IF;
  v_total_active_seconds := v_action.accumulated_active_seconds + v_session_seconds;

  UPDATE public.actions
  SET status = 'completed', accumulated_active_seconds = v_total_active_seconds, started_at = NULL
  WHERE id = v_action.id
  RETURNING * INTO v_action;
  UPDATE public.plan_items SET status = 'completed' WHERE id = v_plan_item.id RETURNING * INTO v_plan_item;

  IF v_plan_item.estimated_minutes IS NULL THEN
    v_completion_metadata := jsonb_build_object(
      'plan_item_id', v_plan_item.id,
      'active_seconds', v_total_active_seconds
    );
  ELSE
    v_completion_metadata := jsonb_build_object(
      'plan_item_id', v_plan_item.id,
      'target_minutes', v_plan_item.estimated_minutes,
      'active_seconds', v_total_active_seconds,
      'delta_seconds', v_total_active_seconds - (v_plan_item.estimated_minutes::bigint * 60)
    );
  END IF;

  INSERT INTO public.activities (user_id, action_id, task_id, type, metadata)
  VALUES
    (v_user_id, v_action.id, v_action.task_id, 'action_completed', v_completion_metadata),
    (v_user_id, v_action.id, v_action.task_id, 'plan_item_completed', jsonb_build_object('plan_item_id', v_plan_item.id));

  RETURN jsonb_build_object('action', to_jsonb(v_action), 'plan_item', to_jsonb(v_plan_item));
END;
$$;

ALTER FUNCTION public.ryqen_complete_today_action(uuid, uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.ryqen_complete_today_action(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ryqen_complete_today_action(uuid, uuid) TO authenticated;
