-- Ryqen V0.1 lifecycle security hardening.
--
-- RLS continues to enforce cross-user ownership. These SECURITY DEFINER
-- routines deliberately retain explicit auth.uid() and ownership checks,
-- because the postgres owner bypasses caller table privileges and RLS.
-- Their empty search_path and schema-qualified references are intentional.

ALTER FUNCTION public.ryqen_start_today_action(uuid, uuid) OWNER TO postgres;
ALTER FUNCTION public.ryqen_start_today_action(uuid, uuid) SECURITY DEFINER;
ALTER FUNCTION public.ryqen_start_today_action(uuid, uuid) SET search_path = '';

ALTER FUNCTION public.ryqen_complete_today_action(uuid, uuid) OWNER TO postgres;
ALTER FUNCTION public.ryqen_complete_today_action(uuid, uuid) SECURITY DEFINER;
ALTER FUNCTION public.ryqen_complete_today_action(uuid, uuid) SET search_path = '';

ALTER FUNCTION public.ryqen_defer_today_action(uuid, uuid) OWNER TO postgres;
ALTER FUNCTION public.ryqen_defer_today_action(uuid, uuid) SECURITY DEFINER;
ALTER FUNCTION public.ryqen_defer_today_action(uuid, uuid) SET search_path = '';

ALTER FUNCTION public.ryqen_skip_today_plan_item(uuid, uuid) OWNER TO postgres;
ALTER FUNCTION public.ryqen_skip_today_plan_item(uuid, uuid) SECURITY DEFINER;
ALTER FUNCTION public.ryqen_skip_today_plan_item(uuid, uuid) SET search_path = '';

ALTER FUNCTION public.ryqen_reconsider_today_action(uuid, uuid) OWNER TO postgres;
ALTER FUNCTION public.ryqen_reconsider_today_action(uuid, uuid) SECURITY DEFINER;
ALTER FUNCTION public.ryqen_reconsider_today_action(uuid, uuid) SET search_path = '';

ALTER FUNCTION public.ryqen_capture_action(text, smallint, timestamptz) OWNER TO postgres;
ALTER FUNCTION public.ryqen_capture_action(text, smallint, timestamptz) SECURITY DEFINER;
ALTER FUNCTION public.ryqen_capture_action(text, smallint, timestamptz) SET search_path = '';

ALTER FUNCTION public.ryqen_capture_action(text, smallint, timestamptz, integer) OWNER TO postgres;
ALTER FUNCTION public.ryqen_capture_action(text, smallint, timestamptz, integer) SECURITY DEFINER;
ALTER FUNCTION public.ryqen_capture_action(text, smallint, timestamptz, integer) SET search_path = '';

-- The planner may only reconcile its own pending/replaced snapshots. It may
-- not change Action lifecycle state, Plan Item lifecycle state, or history.
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

  IF EXISTS (
    SELECT 1
    FROM jsonb_to_recordset(p_items) AS item(
      action_id uuid,
      position integer,
      priority_score numeric,
      rationale text,
      estimated_minutes integer
    )
    GROUP BY action_id
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Planner items must not contain duplicate actions' USING ERRCODE = 'P0001';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_to_recordset(p_items) AS item(
      action_id uuid,
      position integer,
      priority_score numeric,
      rationale text,
      estimated_minutes integer
    )
    WHERE action_id IS NULL
      OR position IS NULL OR position < 1 OR position > 3
      OR priority_score IS NULL OR priority_score < 0
      OR estimated_minutes IS NULL OR estimated_minutes < 1
  ) THEN
    RAISE EXCEPTION 'Invalid planner item snapshot' USING ERRCODE = 'P0001';
  END IF;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_items)
  LOOP
    v_action_id := (v_item ->> 'action_id')::uuid;
    v_position := (v_item ->> 'position')::integer;
    v_priority_score := (v_item ->> 'priority_score')::numeric;
    v_rationale := v_item ->> 'rationale';
    v_estimated_minutes := (v_item ->> 'estimated_minutes')::integer;

    PERFORM 1
    FROM public.actions
    WHERE id = v_action_id
      AND user_id = v_user_id
    FOR KEY SHARE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Planner action not found' USING ERRCODE = 'P0002';
    END IF;

    INSERT INTO public.plan_items (
      daily_plan_id,
      action_id,
      position,
      priority_score,
      rationale,
      estimated_minutes,
      status
    )
    VALUES (
      v_plan.id,
      v_action_id,
      v_position,
      v_priority_score,
      v_rationale,
      v_estimated_minutes,
      'pending'
    )
    ON CONFLICT (daily_plan_id, action_id) DO UPDATE
    SET
      position = EXCLUDED.position,
      priority_score = EXCLUDED.priority_score,
      rationale = EXCLUDED.rationale,
      estimated_minutes = EXCLUDED.estimated_minutes,
      status = CASE
        WHEN public.plan_items.status = 'replaced' THEN 'pending'
        ELSE public.plan_items.status
      END
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

ALTER FUNCTION public.ryqen_reconcile_today_plan(uuid, date, jsonb) OWNER TO postgres;

-- Explicitly remove auto-exposed Data API privileges. Column grants are
-- applied only after table-level UPDATE is revoked, so lifecycle fields cannot
-- be changed directly by authenticated clients.
REVOKE INSERT, UPDATE, DELETE ON TABLE public.actions FROM PUBLIC, anon, authenticated;
GRANT UPDATE (
  title,
  description,
  due_at,
  estimated_minutes,
  importance,
  task_id,
  project_id,
  goal_id
) ON TABLE public.actions TO authenticated;

REVOKE INSERT, UPDATE, DELETE ON TABLE public.plan_items FROM PUBLIC, anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.activities FROM PUBLIC, anon, authenticated;
REVOKE DELETE ON TABLE public.daily_plans FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.ryqen_start_today_action(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.ryqen_complete_today_action(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.ryqen_defer_today_action(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.ryqen_skip_today_plan_item(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.ryqen_reconsider_today_action(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.ryqen_capture_action(text, smallint, timestamptz) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.ryqen_capture_action(text, smallint, timestamptz, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.ryqen_reconcile_today_plan(uuid, date, jsonb) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.ryqen_start_today_action(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ryqen_complete_today_action(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ryqen_defer_today_action(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ryqen_skip_today_plan_item(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ryqen_reconsider_today_action(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ryqen_capture_action(text, smallint, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ryqen_capture_action(text, smallint, timestamptz, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ryqen_reconcile_today_plan(uuid, date, jsonb) TO authenticated;
