CREATE OR REPLACE FUNCTION public.grooming_day_availability(p_tenant_id uuid, p_day date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_allowed boolean;
  v_inhouse_res jsonb;
  v_mobile_res jsonb;
  v_inhouse_busy jsonb;
  v_mobile_busy jsonb;
  v_closures jsonb;
  v_pool int;
  v_busy jsonb;
  v_resources jsonb;
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

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'id', r.id, 'name', r.name, 'type', r.type::text,
           'colour', r.colour, 'sort_order', r.sort_order,
           'workday_start', r.workday_start, 'workday_end', r.workday_end
         ) ORDER BY r.sort_order, r.name), '[]'::jsonb)
  INTO v_inhouse_res
  FROM public.resources r
  WHERE r.tenant_id = p_tenant_id AND r.active AND r.type::text = 'inhouse_grooming';

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'id', r.id, 'name', r.name, 'type', r.type::text,
           'colour', r.colour, 'sort_order', r.sort_order,
           'workday_start', r.workday_start, 'workday_end', r.workday_end
         ) ORDER BY r.sort_order, r.name), '[]'::jsonb)
  INTO v_mobile_res
  FROM public.resources r
  WHERE r.tenant_id = p_tenant_id AND r.active AND r.type::text = 'mobile_van';

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'id', b.id, 'start_at', b.start_at, 'end_at', b.end_at, 'resource_id', b.resource_id
         )), '[]'::jsonb)
  INTO v_inhouse_busy
  FROM public.bookings b
  WHERE b.tenant_id = p_tenant_id
    AND b.service_type::text = 'grooming_inhouse'
    AND b.status::text NOT IN ('cancelled', 'no_show')
    AND b.start_at >= (p_day::timestamp AT TIME ZONE 'Africa/Johannesburg')
    AND b.start_at < ((p_day + 1)::timestamp AT TIME ZONE 'Africa/Johannesburg');

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'id', b.id, 'start_at', b.start_at, 'end_at', b.end_at, 'resource_id', b.resource_id
         )), '[]'::jsonb)
  INTO v_mobile_busy
  FROM public.bookings b
  WHERE b.tenant_id = p_tenant_id
    AND b.service_type::text = 'grooming_mobile'
    AND b.status::text NOT IN ('cancelled', 'no_show')
    AND b.start_at >= (p_day::timestamp AT TIME ZONE 'Africa/Johannesburg')
    AND b.start_at < ((p_day + 1)::timestamp AT TIME ZONE 'Africa/Johannesburg');

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'name', c.name, 'start_date', c.start_date, 'end_date', c.end_date,
           'services', c.services
         ) ORDER BY c.start_date), '[]'::jsonb)
  INTO v_closures
  FROM public.closures c
  WHERE c.tenant_id = p_tenant_id
    AND c.end_date >= (p_day - 60)
    AND c.start_date <= (p_day + 365);

  -- Backwards-compatible top-level fields describe the in-house pool.
  v_pool := GREATEST(1, jsonb_array_length(v_inhouse_res));
  v_busy := v_inhouse_busy;
  v_resources := v_inhouse_res;

  RETURN jsonb_build_object(
    'pool', v_pool,
    'busy', v_busy,
    'resources', v_resources,
    'closures', v_closures,
    'inhouse', jsonb_build_object(
      'pool', GREATEST(1, jsonb_array_length(v_inhouse_res)),
      'resources', v_inhouse_res,
      'busy', v_inhouse_busy
    ),
    'mobile', jsonb_build_object(
      'pool', GREATEST(1, jsonb_array_length(v_mobile_res)),
      'resources', v_mobile_res,
      'busy', v_mobile_busy
    )
  );
END;
$function$;