-- Ryqen V0.1 core domain model.
-- This migration is additive and intentionally leaves legacy Hunter tables untouched.

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TABLE public.contexts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  key text NOT NULL CHECK (btrim(key) <> ''),
  value jsonb NOT NULL,
  source text NOT NULL DEFAULT 'user' CHECK (source IN ('user', 'system', 'integration', 'ai')),
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.goals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'paused', 'archived')),
  importance smallint NOT NULL DEFAULT 3 CHECK (importance BETWEEN 1 AND 5),
  target_date date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT goals_id_user_id_key UNIQUE (id, user_id)
);

CREATE TABLE public.projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  goal_id uuid,
  title text NOT NULL,
  description text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'paused', 'archived')),
  importance smallint NOT NULL DEFAULT 3 CHECK (importance BETWEEN 1 AND 5),
  target_date date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT projects_id_user_id_key UNIQUE (id, user_id),
  CONSTRAINT projects_goal_id_user_id_fkey
    FOREIGN KEY (goal_id, user_id)
    REFERENCES public.goals (id, user_id)
    ON DELETE SET NULL (goal_id)
);

CREATE TABLE public.tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id uuid,
  goal_id uuid,
  title text NOT NULL,
  description text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'cancelled', 'blocked', 'deferred')),
  importance smallint NOT NULL DEFAULT 3 CHECK (importance BETWEEN 1 AND 5),
  urgency smallint NOT NULL DEFAULT 3 CHECK (urgency BETWEEN 1 AND 5),
  estimated_minutes integer CHECK (estimated_minutes > 0),
  due_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tasks_id_user_id_key UNIQUE (id, user_id),
  CONSTRAINT tasks_project_id_user_id_fkey
    FOREIGN KEY (project_id, user_id)
    REFERENCES public.projects (id, user_id)
    ON DELETE SET NULL (project_id),
  CONSTRAINT tasks_goal_id_user_id_fkey
    FOREIGN KEY (goal_id, user_id)
    REFERENCES public.goals (id, user_id)
    ON DELETE SET NULL (goal_id)
);

CREATE TABLE public.actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  task_id uuid,
  project_id uuid,
  goal_id uuid,
  title text NOT NULL,
  description text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'cancelled', 'deferred')),
  estimated_minutes integer CHECK (estimated_minutes > 0),
  due_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT actions_id_user_id_key UNIQUE (id, user_id),
  CONSTRAINT actions_task_id_user_id_fkey
    FOREIGN KEY (task_id, user_id)
    REFERENCES public.tasks (id, user_id)
    ON DELETE SET NULL (task_id),
  CONSTRAINT actions_project_id_user_id_fkey
    FOREIGN KEY (project_id, user_id)
    REFERENCES public.projects (id, user_id)
    ON DELETE SET NULL (project_id),
  CONSTRAINT actions_goal_id_user_id_fkey
    FOREIGN KEY (goal_id, user_id)
    REFERENCES public.goals (id, user_id)
    ON DELETE SET NULL (goal_id)
);

CREATE TABLE public.daily_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plan_date date NOT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'completed', 'archived')),
  context_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  generated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT daily_plans_user_id_plan_date_key UNIQUE (user_id, plan_date)
);

CREATE TABLE public.plan_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  daily_plan_id uuid NOT NULL REFERENCES public.daily_plans(id) ON DELETE CASCADE,
  action_id uuid NOT NULL REFERENCES public.actions(id) ON DELETE RESTRICT,
  position integer NOT NULL CHECK (position > 0),
  priority_score numeric(8,3) NOT NULL CHECK (priority_score >= 0),
  rationale text,
  estimated_minutes integer CHECK (estimated_minutes > 0),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'skipped', 'deferred')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.activities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  action_id uuid,
  task_id uuid,
  type text NOT NULL CHECK (type IN (
    'action_started',
    'action_completed',
    'action_skipped',
    'task_started',
    'task_completed',
    'plan_item_started',
    'plan_item_completed',
    'plan_item_skipped',
    'goal_progress'
  )),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT activities_action_id_user_id_fkey
    FOREIGN KEY (action_id, user_id)
    REFERENCES public.actions (id, user_id)
    ON DELETE SET NULL (action_id),
  CONSTRAINT activities_task_id_user_id_fkey
    FOREIGN KEY (task_id, user_id)
    REFERENCES public.tasks (id, user_id)
    ON DELETE SET NULL (task_id)
);

CREATE TRIGGER contexts_set_updated_at
BEFORE UPDATE ON public.contexts
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER goals_set_updated_at
BEFORE UPDATE ON public.goals
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER projects_set_updated_at
BEFORE UPDATE ON public.projects
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER tasks_set_updated_at
BEFORE UPDATE ON public.tasks
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER actions_set_updated_at
BEFORE UPDATE ON public.actions
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER daily_plans_set_updated_at
BEFORE UPDATE ON public.daily_plans
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX contexts_user_id_idx ON public.contexts (user_id);
CREATE INDEX goals_user_id_status_idx ON public.goals (user_id, status);
CREATE INDEX projects_user_id_status_idx ON public.projects (user_id, status);
CREATE INDEX projects_goal_id_user_id_idx ON public.projects (goal_id, user_id);
CREATE INDEX tasks_user_id_status_idx ON public.tasks (user_id, status);
CREATE INDEX tasks_user_id_due_at_idx ON public.tasks (user_id, due_at) WHERE due_at IS NOT NULL;
CREATE INDEX tasks_project_id_user_id_idx ON public.tasks (project_id, user_id);
CREATE INDEX tasks_goal_id_user_id_idx ON public.tasks (goal_id, user_id);
CREATE INDEX actions_user_id_status_idx ON public.actions (user_id, status);
CREATE INDEX actions_user_id_due_at_idx ON public.actions (user_id, due_at) WHERE due_at IS NOT NULL;
CREATE INDEX actions_task_id_user_id_idx ON public.actions (task_id, user_id);
CREATE INDEX actions_project_id_user_id_idx ON public.actions (project_id, user_id);
CREATE INDEX actions_goal_id_user_id_idx ON public.actions (goal_id, user_id);
CREATE INDEX plan_items_daily_plan_id_position_idx ON public.plan_items (daily_plan_id, position);
CREATE INDEX plan_items_action_id_idx ON public.plan_items (action_id);
CREATE INDEX activities_user_id_occurred_at_idx ON public.activities (user_id, occurred_at DESC);
CREATE INDEX activities_action_id_user_id_idx ON public.activities (action_id, user_id);
CREATE INDEX activities_task_id_user_id_idx ON public.activities (task_id, user_id);

ALTER TABLE public.contexts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plan_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activities ENABLE ROW LEVEL SECURITY;

CREATE POLICY contexts_select_own ON public.contexts
FOR SELECT TO authenticated
USING (user_id = auth.uid());

CREATE POLICY contexts_insert_own ON public.contexts
FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid());

CREATE POLICY contexts_update_own ON public.contexts
FOR UPDATE TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

CREATE POLICY contexts_delete_own ON public.contexts
FOR DELETE TO authenticated
USING (user_id = auth.uid());

CREATE POLICY goals_select_own ON public.goals
FOR SELECT TO authenticated
USING (user_id = auth.uid());

CREATE POLICY goals_insert_own ON public.goals
FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid());

CREATE POLICY goals_update_own ON public.goals
FOR UPDATE TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

CREATE POLICY goals_delete_own ON public.goals
FOR DELETE TO authenticated
USING (user_id = auth.uid());

CREATE POLICY projects_select_own ON public.projects
FOR SELECT TO authenticated
USING (user_id = auth.uid());

CREATE POLICY projects_insert_own ON public.projects
FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid());

CREATE POLICY projects_update_own ON public.projects
FOR UPDATE TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

CREATE POLICY projects_delete_own ON public.projects
FOR DELETE TO authenticated
USING (user_id = auth.uid());

CREATE POLICY tasks_select_own ON public.tasks
FOR SELECT TO authenticated
USING (user_id = auth.uid());

CREATE POLICY tasks_insert_own ON public.tasks
FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid());

CREATE POLICY tasks_update_own ON public.tasks
FOR UPDATE TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

CREATE POLICY tasks_delete_own ON public.tasks
FOR DELETE TO authenticated
USING (user_id = auth.uid());

CREATE POLICY actions_select_own ON public.actions
FOR SELECT TO authenticated
USING (user_id = auth.uid());

CREATE POLICY actions_insert_own ON public.actions
FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid());

CREATE POLICY actions_update_own ON public.actions
FOR UPDATE TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

CREATE POLICY actions_delete_own ON public.actions
FOR DELETE TO authenticated
USING (user_id = auth.uid());

CREATE POLICY daily_plans_select_own ON public.daily_plans
FOR SELECT TO authenticated
USING (user_id = auth.uid());

CREATE POLICY daily_plans_insert_own ON public.daily_plans
FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid());

CREATE POLICY daily_plans_update_own ON public.daily_plans
FOR UPDATE TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

CREATE POLICY daily_plans_delete_own ON public.daily_plans
FOR DELETE TO authenticated
USING (user_id = auth.uid());

CREATE POLICY plan_items_select_own ON public.plan_items
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.daily_plans
    WHERE daily_plans.id = plan_items.daily_plan_id
      AND daily_plans.user_id = auth.uid()
  )
);

CREATE POLICY plan_items_insert_own ON public.plan_items
FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.daily_plans
    WHERE daily_plans.id = plan_items.daily_plan_id
      AND daily_plans.user_id = auth.uid()
  )
  AND EXISTS (
    SELECT 1
    FROM public.actions
    WHERE actions.id = plan_items.action_id
      AND actions.user_id = auth.uid()
  )
);

CREATE POLICY plan_items_update_own ON public.plan_items
FOR UPDATE TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.daily_plans
    WHERE daily_plans.id = plan_items.daily_plan_id
      AND daily_plans.user_id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.daily_plans
    WHERE daily_plans.id = plan_items.daily_plan_id
      AND daily_plans.user_id = auth.uid()
  )
  AND EXISTS (
    SELECT 1
    FROM public.actions
    WHERE actions.id = plan_items.action_id
      AND actions.user_id = auth.uid()
  )
);

CREATE POLICY plan_items_delete_own ON public.plan_items
FOR DELETE TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.daily_plans
    WHERE daily_plans.id = plan_items.daily_plan_id
      AND daily_plans.user_id = auth.uid()
  )
);

CREATE POLICY activities_select_own ON public.activities
FOR SELECT TO authenticated
USING (user_id = auth.uid());

CREATE POLICY activities_insert_own ON public.activities
FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid());

CREATE POLICY activities_update_own ON public.activities
FOR UPDATE TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

CREATE POLICY activities_delete_own ON public.activities
FOR DELETE TO authenticated
USING (user_id = auth.uid());

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.contexts TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.goals TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.projects TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.tasks TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.actions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.daily_plans TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.plan_items TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.activities TO authenticated;
