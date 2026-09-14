-- Effort-aware V0.1 standalone Action capture.
-- actions.estimated_minutes already exists; preserve existing values and make
-- the capture default explicit for records that did not previously set one.

UPDATE public.actions
SET estimated_minutes = 30
WHERE estimated_minutes IS NULL;

ALTER TABLE public.actions
  ALTER COLUMN estimated_minutes SET DEFAULT 30,
  ALTER COLUMN estimated_minutes SET NOT NULL;

ALTER TABLE public.actions
  DROP CONSTRAINT actions_estimated_minutes_check,
  ADD CONSTRAINT actions_estimated_minutes_range_check
    CHECK (estimated_minutes BETWEEN 1 AND 480) NOT VALID;

-- The existing three-argument RPC remains available for already-deployed
-- clients. This overload is used by effort-aware capture clients.
CREATE OR REPLACE FUNCTION public.ryqen_capture_action(
  p_title text,
  p_importance smallint,
  p_due_at timestamptz,
  p_estimated_minutes integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_title text := btrim(p_title);
  v_action public.actions%ROWTYPE;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  IF v_title IS NULL OR v_title = '' THEN
    RAISE EXCEPTION 'A title is required to capture work' USING ERRCODE = 'P0001';
  END IF;

  IF p_importance IS NULL OR p_importance NOT BETWEEN 1 AND 5 THEN
    RAISE EXCEPTION 'Importance must be between 1 and 5' USING ERRCODE = 'P0001';
  END IF;

  IF p_estimated_minutes IS NULL OR p_estimated_minutes NOT BETWEEN 1 AND 480 THEN
    RAISE EXCEPTION 'Estimated duration must be between 1 and 480 minutes' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.actions (user_id, title, status, importance, due_at, estimated_minutes)
  VALUES (v_user_id, v_title, 'pending', p_importance, p_due_at, p_estimated_minutes)
  RETURNING * INTO v_action;

  RETURN to_jsonb(v_action);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.ryqen_capture_action(text, smallint, timestamptz, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ryqen_capture_action(text, smallint, timestamptz, integer) TO authenticated;
