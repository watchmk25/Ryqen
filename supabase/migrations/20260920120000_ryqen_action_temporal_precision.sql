-- Ryqen V0.1 Action temporal precision.
--
-- Keep due_at as an untouched legacy compatibility field. New capture uses
-- due_date plus optional due_time, which preserves a date-only deadline
-- without manufacturing an end-of-day timestamp.

ALTER TABLE public.actions
  ADD COLUMN due_date date,
  ADD COLUMN due_time time without time zone,
  ADD CONSTRAINT actions_due_time_requires_due_date_check
    CHECK (due_time IS NULL OR due_date IS NOT NULL);

-- Preserve the existing ordinary Action-edit boundary for the newly added
-- non-lifecycle fields. Ownership still comes from Actions RLS; lifecycle
-- fields remain unavailable to direct authenticated updates.
GRANT UPDATE (due_date, due_time) ON TABLE public.actions TO authenticated;

-- Existing capture overloads remain available for already-deployed clients.
-- The V0.1 capture path uses this date-first overload and deliberately leaves
-- due_at NULL for new semantic data.
CREATE OR REPLACE FUNCTION public.ryqen_capture_action(
  p_title text,
  p_importance smallint,
  p_due_date date,
  p_due_time time without time zone,
  p_estimated_minutes integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
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

  IF p_due_time IS NOT NULL AND p_due_date IS NULL THEN
    RAISE EXCEPTION 'A due time requires a due date' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.actions (
    user_id, title, status, importance, due_date, due_time, estimated_minutes
  )
  VALUES (
    v_user_id, v_title, 'pending', p_importance, p_due_date, p_due_time, p_estimated_minutes
  )
  RETURNING * INTO v_action;

  RETURN to_jsonb(v_action);
END;
$$;

ALTER FUNCTION public.ryqen_capture_action(text, smallint, date, time without time zone, integer) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.ryqen_capture_action(text, smallint, date, time without time zone, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ryqen_capture_action(text, smallint, date, time without time zone, integer) TO authenticated;

-- This client requires the date-first capture endpoint. Keep the existing
-- compatibility guard authoritative rather than allowing a generic missing
-- RPC failure on an older hosted backend.
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

  RETURN jsonb_build_object('contract_version', 4);
END;
$$;

ALTER FUNCTION public.ryqen_today_backend_contract() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.ryqen_today_backend_contract() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ryqen_today_backend_contract() TO authenticated;
