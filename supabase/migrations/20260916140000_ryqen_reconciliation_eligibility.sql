-- Ryqen V0.1 reconciliation eligibility hardening.
--
-- Reconciliation is not a second planner. It enforces only the persistent
-- minimum for a fresh pending Plan Item: a user-owned pending Action whose
-- linked Task, Project, and Goal rows are currently actionable under the
-- same state rules used by the deterministic planner. Context-specific
-- exclusions, time/capacity selection, and ranking remain application/domain
-- planner responsibilities.

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
  v_action public.actions%ROWTYPE;
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

  -- Keep the established Action → Daily Plan → Plan Item order. Action rows
  -- are locked in a stable order before their eligibility is checked.
  FOR v_action_id IN
    SELECT item.action_id
    FROM jsonb_to_recordset(p_items) AS item(action_id uuid)
    ORDER BY item.action_id
  LOOP
    SELECT * INTO v_action
    FROM public.actions
    WHERE id = v_action_id AND user_id = v_user_id
    FOR KEY SHARE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Planner action not found' USING ERRCODE = 'P0002';
    END IF;

    IF EXISTS (
      SELECT 1
      FROM public.actions AS action
      LEFT JOIN public.tasks AS task
        ON task.id = action.task_id AND task.user_id = action.user_id
      LEFT JOIN public.projects AS action_project
        ON action_project.id = action.project_id AND action_project.user_id = action.user_id
      LEFT JOIN public.projects AS task_project
        ON task_project.id = task.project_id AND task_project.user_id = action.user_id
      LEFT JOIN public.goals AS action_goal
        ON action_goal.id = action.goal_id AND action_goal.user_id = action.user_id
      LEFT JOIN public.goals AS task_goal
        ON task_goal.id = task.goal_id AND task_goal.user_id = action.user_id
      LEFT JOIN public.goals AS action_project_goal
        ON action_project_goal.id = action_project.goal_id AND action_project_goal.user_id = action.user_id
      LEFT JOIN public.goals AS task_project_goal
        ON task_project_goal.id = task_project.goal_id AND task_project_goal.user_id = action.user_id
      WHERE action.id = v_action.id
        AND action.user_id = v_user_id
        AND (
          action.status <> 'pending'
          OR (action.task_id IS NOT NULL AND (task.id IS NULL OR task.status NOT IN ('pending', 'in_progress')))
          OR (action.project_id IS NOT NULL AND (action_project.id IS NULL OR action_project.status <> 'active'))
          OR (task.project_id IS NOT NULL AND (task_project.id IS NULL OR task_project.status <> 'active'))
          OR (action.goal_id IS NOT NULL AND (action_goal.id IS NULL OR action_goal.status <> 'active'))
          OR (task.goal_id IS NOT NULL AND (task_goal.id IS NULL OR task_goal.status <> 'active'))
          OR (action_project.goal_id IS NOT NULL AND (action_project_goal.id IS NULL OR action_project_goal.status <> 'active'))
          OR (task_project.goal_id IS NOT NULL AND (task_project_goal.id IS NULL OR task_project_goal.status <> 'active'))
        )
    ) THEN
      RAISE EXCEPTION 'Planner action is not eligible for a pending plan item' USING ERRCODE = 'P0001';
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

ALTER FUNCTION public.ryqen_reconcile_today_plan(uuid, date, jsonb) OWNER TO postgres;
