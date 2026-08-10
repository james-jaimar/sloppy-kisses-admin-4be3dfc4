ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS booking_group_id uuid;
CREATE INDEX IF NOT EXISTS bookings_booking_group_id_idx ON public.bookings (booking_group_id) WHERE booking_group_id IS NOT NULL;

ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS preferred_groomer_resource_id uuid REFERENCES public.resources(id) ON DELETE SET NULL;

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

  SELECT GREATEST(1, COUNT(*)::int) INTO v_pool
  FROM public.resources r
  WHERE r.tenant_id = p_tenant_id
    AND r.active
    AND r.type::text IN ('inhouse_grooming', 'mobile_van');

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'id', r.id, 'name', r.name, 'type', r.type::text,
           'colour', r.colour, 'sort_order', r.sort_order
         ) ORDER BY r.sort_order, r.name), '[]'::jsonb)
  INTO v_resources
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

  RETURN jsonb_build_object('pool', v_pool, 'busy', v_busy, 'resources', v_resources);
END;
$$;

REVOKE ALL ON FUNCTION public.grooming_day_availability(uuid, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.grooming_day_availability(uuid, date) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.grooming_pick_resource(
  p_tenant_id uuid,
  p_start timestamptz,
  p_end timestamptz,
  p_service_type text DEFAULT 'grooming_inhouse',
  p_customer_id uuid DEFAULT NULL,
  p_exclude_booking_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_allowed boolean;
  v_type text;
  v_preferred uuid;
  v_pick uuid;
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

  v_type := CASE WHEN p_service_type = 'grooming_mobile' THEN 'mobile_van' ELSE 'inhouse_grooming' END;

  IF p_customer_id IS NOT NULL THEN
    SELECT c.preferred_groomer_resource_id INTO v_preferred
    FROM public.customers c
    WHERE c.id = p_customer_id AND c.tenant_id = p_tenant_id;
  END IF;

  SELECT r.id INTO v_pick
  FROM public.resources r
  WHERE r.tenant_id = p_tenant_id
    AND r.active
    AND r.type::text = v_type
    AND NOT EXISTS (
      SELECT 1 FROM public.bookings b
      WHERE b.tenant_id = p_tenant_id
        AND b.resource_id = r.id
        AND b.status::text NOT IN ('cancelled', 'no_show')
        AND (p_exclude_booking_id IS NULL OR b.id <> p_exclude_booking_id)
        AND b.start_at < p_end
        AND COALESCE(b.end_at, b.start_at + interval '1 hour') > p_start
    )
  ORDER BY (r.id = v_preferred) DESC, r.sort_order NULLS LAST, r.name
  LIMIT 1;

  RETURN v_pick;
END;
$$;

REVOKE ALL ON FUNCTION public.grooming_pick_resource(uuid, timestamptz, timestamptz, text, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.grooming_pick_resource(uuid, timestamptz, timestamptz, text, uuid, uuid) TO authenticated, service_role;