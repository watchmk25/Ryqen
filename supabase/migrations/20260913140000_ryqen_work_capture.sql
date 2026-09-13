-- Minimal V0.1 work capture support for standalone Actions.
-- This migration leaves legacy Hunter tables and existing Today operations untouched.

ALTER TABLE public.actions
  ADD COLUMN importance smallint NOT NULL DEFAULT 3 CHECK (importance BETWEEN 1 AND 5);

CREATE OR REPLACE FUNCTION public.ryqen_capture_action(
  p_title text,
  p_importance smallint,
  p_due_at timestamptz
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

  INSERT INTO public.actions (user_id, title, status, importance, due_at)
  VALUES (v_user_id, v_title, 'pending', p_importance, p_due_at)
  RETURNING * INTO v_action;

  RETURN to_jsonb(v_action);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.ryqen_capture_action(text, smallint, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ryqen_capture_action(text, smallint, timestamptz) TO authenticated;
