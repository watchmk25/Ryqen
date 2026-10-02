-- ADR-001: Server-authoritative XP boundary

-- 1. Secure characters table
-- Remove the broad legacy Data API write surface before granting the narrow
-- client-owned fields below. Progression can only change through the
-- security-definer focus-session RPC in this migration.
REVOKE UPDATE, INSERT, DELETE ON TABLE public.characters FROM PUBLIC, anon, authenticated;

-- Explicitly grant UPDATE on non-progression fields to authenticated users
GRANT UPDATE (
  name,
  title,
  str,
  int,
  vit,
  agi,
  endurance,
  last_quest_date,
  onboarding_complete,
  total_quests_completed,
  current_streak,
  longest_streak,
  streak_shields,
  streak_credited_date
) ON TABLE public.characters TO authenticated;

-- A newly authenticated user may create only their own default character
-- record. Defaults establish every other field, including progression.
GRANT INSERT (user_id) ON TABLE public.characters TO authenticated;

-- Focus sessions are created only through the authoritative RPC. Existing
-- SELECT access remains in place for focus-history displays.
REVOKE INSERT, UPDATE, DELETE ON TABLE public.focus_sessions FROM PUBLIC, anon, authenticated;

-- 2. Create authoritative focus session recording RPC
CREATE OR REPLACE FUNCTION public.ryqen_record_focus_session(
  p_session_id uuid,
  p_duration_minutes integer,
  p_type text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_bounded_duration integer;
  v_xp_awarded integer;
  v_character public.characters%ROWTYPE;
  v_new_total_xp integer;
  v_new_level integer;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  IF p_session_id IS NULL THEN
    RAISE EXCEPTION 'Session ID is required' USING ERRCODE = '22004';
  END IF;

  -- Validate and bound duration
  IF p_duration_minutes < 0 THEN
    RAISE EXCEPTION 'Duration cannot be negative' USING ERRCODE = '22003';
  END IF;

  -- Maximum allowed duration is 120 minutes per ADR-001 guidance
  IF p_duration_minutes > 120 THEN
    RAISE EXCEPTION 'Duration exceeds maximum allowed bounds' USING ERRCODE = '22003';
  END IF;

  v_bounded_duration := p_duration_minutes;

  -- Calculate XP based on the verified repository rule (duration * 5)
  v_xp_awarded := v_bounded_duration * 5;

  -- Enforce idempotency by inserting the focus session with the provided UUID.
  -- This will throw a unique violation (23505) if the session was already recorded.
  BEGIN
    INSERT INTO public.focus_sessions (id, user_id, duration_minutes, type, date)
    VALUES (p_session_id, v_user_id, v_bounded_duration, p_type, CURRENT_DATE);
  EXCEPTION WHEN unique_violation THEN
    -- If duplicate, we gracefully return the existing state without awarding XP again.
    SELECT * INTO v_character FROM public.characters WHERE user_id = v_user_id;
    RETURN jsonb_build_object(
      'status', 'already_processed',
      'xp_awarded', 0,
      'total_xp', v_character.total_xp,
      'level', v_character.level
    );
  END;

  -- Atomic update of progression state
  -- Lock the row for update to prevent concurrent progression increments
  SELECT * INTO v_character
  FROM public.characters
  WHERE user_id = v_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Character not found' USING ERRCODE = 'P0002';
  END IF;

  v_new_total_xp := v_character.total_xp + v_xp_awarded;
  -- Level calculation: Math.floor(total_xp / 200) + 1
  v_new_level := floor(v_new_total_xp / 200) + 1;

  UPDATE public.characters
  SET
    total_xp = v_new_total_xp,
    level = v_new_level
  WHERE user_id = v_user_id;

  RETURN jsonb_build_object(
    'status', 'success',
    'xp_awarded', v_xp_awarded,
    'total_xp', v_new_total_xp,
    'level', v_new_level
  );
END;
$$;

ALTER FUNCTION public.ryqen_record_focus_session(uuid, integer, text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.ryqen_record_focus_session(uuid, integer, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ryqen_record_focus_session(uuid, integer, text) TO authenticated;
