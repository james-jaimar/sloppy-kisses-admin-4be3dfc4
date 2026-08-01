CREATE OR REPLACE FUNCTION public.grooming_day_availability(p_tenant_id uuid, p_day date)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_allowed boolean;
  v_pool int;
  v_busy jsonb;
BEGIN
  SELECT public.user_has_tenant_access(p_tenant_id)
      OR EXISTS (
        SELECT 1 FROM public.customers c
        WHERE c.tenant_id = p_tenant_id
          AND c.linked_profile_id = public.current_profile_id()
      )
  INTO v_allowed;

  IF NOT v_allowed THEN
    RAISE EXCEPTION 'Not authorised for this tenant';
  END IF;

  SELECT GREATEST(1, COUNT(*)::int) INTO v_pool
  FROM public.resources r
  WHERE r.tenant_id = p_tenant_id
    AND r.active
    AND r.type::text IN ('inhouse_grooming', 'mobile_van');

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'id', b.id, 'start_at', b.start_at, 'end_at', b.end_at, 'resource_id', b.resource_id
         )), '[]'::jsonb)
  INTO v_busy
  FROM public.bookings b
  WHERE b.tenant_id = p_tenant_id
    AND b.service_type::text IN ('grooming_inhouse', 'grooming_mobile')
    AND b.status::text NOT IN ('cancelled', 'no_show')
    AND b.start_at >= (p_day::timestamp AT TIME ZONE 'Africa/Johannesburg')
    AND b.start_at < ((p_day + 1)::timestamp AT TIME ZONE 'Africa/Johannesburg');

  RETURN jsonb_build_object('pool', v_pool, 'busy', v_busy);
END;
$$;

REVOKE ALL ON FUNCTION public.grooming_day_availability(uuid, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.grooming_day_availability(uuid, date) TO authenticated;