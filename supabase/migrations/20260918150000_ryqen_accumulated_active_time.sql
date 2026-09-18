-- Ryqen V0.1 accumulated active-time lifecycle semantics.
--
-- started_at is only the open active-session marker. Closed sessions are
-- persisted on the Action so pauses, deferrals, completion, and local-day
-- boundaries cannot cause elapsed time to be lost or inflated.

ALTER TABLE public.actions
  ADD COLUMN accumulated_active_seconds bigint NOT NULL DEFAULT 0
    CHECK (accumulated_active_seconds >= 0);

-- Keep lifecycle-owned timing unavailable to ordinary authenticated Action
-- edits. The protected functions below remain the only mutation path.
REVOKE UPDATE (accumulated_active_seconds) ON TABLE public.actions FROM PUBLIC, anon, authenticated;

-- The established lock order is Action -> Daily Plan -> Plan Item.
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
  v_session_end timestamptz;
  v_session_seconds bigint := 0;
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
    RAISE EXCEPTION 'Pause requires an in-progress action and plan item' USING ERRCODE = 'P0001';
  END IF;

  IF v_action.started_at IS NOT NULL THEN
    -- No user timezone exists in V0.1, so lifecycle timing uses the explicit
    -- UTC calendar boundary shared by the server and foreground display.
    v_session_end := LEAST(now(), (date_trunc('day', v_action.started_at AT TIME ZONE 'UTC') + interval '1 day') AT TIME ZONE 'UTC');
    v_session_seconds := GREATEST(0, floor(extract(epoch FROM v_session_end - v_action.started_at)))::bigint;
  END IF;

  UPDATE public.actions
  SET status = 'paused',
      accumulated_active_seconds = v_action.accumulated_active_seconds + v_session_seconds,
      started_at = NULL
  WHERE id = v_action.id
  RETURNING * INTO v_action;
  UPDATE public.plan_items SET status = 'paused' WHERE id = v_plan_item.id RETURNING * INTO v_plan_item;

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

  IF v_action.status <> 'paused' OR v_plan_item.status <> 'paused' THEN
    RAISE EXCEPTION 'Resume requires a paused action and plan item' USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.actions
  SET status = 'in_progress', started_at = now()
  WHERE id = v_action.id
  RETURNING * INTO v_action;
  UPDATE public.plan_items SET status = 'in_progress' WHERE id = v_plan_item.id RETURNING * INTO v_plan_item;

  INSERT INTO public.activities (user_id, action_id, task_id, type, metadata)
  VALUES (v_user_id, v_action.id, v_action.task_id, 'action_resumed', jsonb_build_object('plan_item_id', v_plan_item.id));

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

  v_completion_metadata := jsonb_build_object(
    'plan_item_id', v_plan_item.id,
    'target_minutes', v_plan_item.estimated_minutes,
    'active_seconds', v_total_active_seconds
  ) || CASE WHEN v_plan_item.estimated_minutes IS NULL THEN '{}'::jsonb
       ELSE jsonb_build_object('delta_seconds', v_total_active_seconds - (v_plan_item.estimated_minutes::bigint * 60)) END;

  INSERT INTO public.activities (user_id, action_id, task_id, type, metadata)
  VALUES
    (v_user_id, v_action.id, v_action.task_id, 'action_completed', v_completion_metadata),
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
  v_session_end timestamptz;
  v_session_seconds bigint := 0;
  v_total_active_seconds bigint;
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

  IF v_action.status = 'in_progress' AND v_action.started_at IS NOT NULL THEN
    v_session_end := LEAST(now(), (date_trunc('day', v_action.started_at AT TIME ZONE 'UTC') + interval '1 day') AT TIME ZONE 'UTC');
    v_session_seconds := GREATEST(0, floor(extract(epoch FROM v_session_end - v_action.started_at)))::bigint;
  END IF;
  v_total_active_seconds := v_action.accumulated_active_seconds + v_session_seconds;

  UPDATE public.actions
  SET status = 'deferred',
      accumulated_active_seconds = v_total_active_seconds,
      started_at = CASE WHEN v_action.status = 'in_progress' THEN NULL ELSE v_action.started_at END
  WHERE id = v_action.id
  RETURNING * INTO v_action;
  UPDATE public.plan_items SET status = 'deferred' WHERE id = v_plan_item.id RETURNING * INTO v_plan_item;

  INSERT INTO public.activities (user_id, action_id, task_id, type, metadata)
  VALUES (v_user_id, v_action.id, v_action.task_id, 'action_deferred', jsonb_build_object('plan_item_id', v_plan_item.id));

  RETURN jsonb_build_object('action', to_jsonb(v_action), 'plan_item', to_jsonb(v_plan_item));
END;
$$;

ALTER FUNCTION public.ryqen_start_today_action(uuid, uuid) OWNER TO postgres;
ALTER FUNCTION public.ryqen_pause_today_action(uuid, uuid) OWNER TO postgres;
ALTER FUNCTION public.ryqen_resume_today_action(uuid, uuid) OWNER TO postgres;
ALTER FUNCTION public.ryqen_complete_today_action(uuid, uuid) OWNER TO postgres;
ALTER FUNCTION public.ryqen_defer_today_action(uuid, uuid) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.ryqen_start_today_action(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.ryqen_pause_today_action(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.ryqen_resume_today_action(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.ryqen_complete_today_action(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.ryqen_defer_today_action(uuid, uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.ryqen_start_today_action(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ryqen_pause_today_action(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ryqen_resume_today_action(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ryqen_complete_today_action(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ryqen_defer_today_action(uuid, uuid) TO authenticated;

-- The mobile client now requires accumulated_active_seconds in lifecycle RPC
-- results, so a pre-migration backend must be rejected explicitly.
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

  RETURN jsonb_build_object('contract_version', 3);
END;
$$;

ALTER FUNCTION public.ryqen_today_backend_contract() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.ryqen_today_backend_contract() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ryqen_today_backend_contract() TO authenticated;
