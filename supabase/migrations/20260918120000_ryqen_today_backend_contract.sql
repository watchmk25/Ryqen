-- Ryqen V0.1 hosted-backend compatibility contract.
--
-- This is intentionally a narrow authenticated read-only endpoint. Its
-- version changes only for backend API changes that require a newer client.

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

  RETURN jsonb_build_object('contract_version', 1);
END;
$$;

ALTER FUNCTION public.ryqen_today_backend_contract() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.ryqen_today_backend_contract() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.ryqen_today_backend_contract() FROM anon;
GRANT EXECUTE ON FUNCTION public.ryqen_today_backend_contract() TO authenticated;
