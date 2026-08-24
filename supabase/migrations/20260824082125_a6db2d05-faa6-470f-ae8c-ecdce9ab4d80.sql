-- 1) Hotel occupancy readable by staff OR the linked portal customer (counts only)
CREATE OR REPLACE FUNCTION public.hotel_day_availability(p_tenant_id uuid, p_start date, p_end date, p_exclude_booking_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(resource_id uuid, resource_name text, capacity integer, day date, used integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH allowed AS (
    SELECT (
      public.user_has_tenant_access(p_tenant_id)
      OR EXISTS (
        SELECT 1 FROM public.customers c
        WHERE c.tenant_id = p_tenant_id
          AND c.linked_profile_id = public.current_profile_id()
      )
    ) AS ok
  ),
  days AS (
    SELECT generate_series(p_start, GREATEST(p_start, p_end - 1), interval '1 day')::date AS d
  ),
  res AS (
    SELECT r.id, r.name, r.capacity
    FROM public.resources r
    WHERE r.tenant_id = p_tenant_id
      AND r.active
      AND r.type IN ('hotel_area','cattery_area')
  ),
  stays AS (
    SELECT b.id, b.resource_id,
           (b.start_at AT TIME ZONE 'Africa/Johannesburg')::date AS s,
           COALESCE((b.end_at AT TIME ZONE 'Africa/Johannesburg')::date, (b.start_at AT TIME ZONE 'Africa/Johannesburg')::date + 1) AS e
    FROM public.bookings b
    WHERE b.tenant_id = p_tenant_id
      AND b.service_type IN ('hotel_dog','hotel_cat')
      AND b.status NOT IN ('cancelled','no_show','completed','checked_out')
      AND (p_exclude_booking_id IS NULL OR b.id <> p_exclude_booking_id)
      AND b.resource_id IS NOT NULL
  ),
  occ AS (
    SELECT COALESCE(bp.resource_id, st.resource_id) AS resource_id, st.s, st.e, 1 AS pet_count
    FROM stays st
    JOIN public.booking_pets bp ON bp.booking_id = st.id
    UNION ALL
    SELECT st.resource_id, st.s, st.e, 1
    FROM stays st
    WHERE NOT EXISTS (SELECT 1 FROM public.booking_pets bp WHERE bp.booking_id = st.id)
  )
  SELECT res.id, res.name, res.capacity, days.d,
         COALESCE((
           SELECT sum(o.pet_count)::int FROM occ o
           WHERE o.resource_id = res.id AND days.d >= o.s AND days.d < o.e
         ), 0) AS used
  FROM res CROSS JOIN days
  WHERE (SELECT ok FROM allowed)
  ORDER BY res.name, days.d;
$function$;

REVOKE ALL ON FUNCTION public.hotel_day_availability(uuid, date, date, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.hotel_day_availability(uuid, date, date, uuid) TO authenticated;

-- 2) Transport workflow settings: van load limits
ALTER TABLE public.transport_workflow_settings
  ADD COLUMN IF NOT EXISTS max_stops_per_van_per_day integer NOT NULL DEFAULT 12,
  ADD COLUMN IF NOT EXISTS overbooking_mode text NOT NULL DEFAULT 'warn';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'transport_workflow_settings_overbooking_mode_check'
  ) THEN
    ALTER TABLE public.transport_workflow_settings
      ADD CONSTRAINT transport_workflow_settings_overbooking_mode_check
      CHECK (overbooking_mode IN ('warn','block'));
  END IF;
END $$;

-- 3) Per-van, per-day stop counts for pick up / drop-off
CREATE OR REPLACE FUNCTION public.transport_day_load(
  p_tenant_id uuid,
  p_start date,
  p_end date,
  p_exclude_booking_id uuid DEFAULT NULL::uuid
)
 RETURNS TABLE(resource_id uuid, resource_name text, day date, stops integer, max_stops integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH allowed AS (
    SELECT (
      public.user_has_tenant_access(p_tenant_id)
      OR EXISTS (
        SELECT 1 FROM public.customers c
        WHERE c.tenant_id = p_tenant_id
          AND c.linked_profile_id = public.current_profile_id()
      )
    ) AS ok
  ),
  days AS (
    SELECT generate_series(p_start, GREATEST(p_start, p_end - 1), interval '1 day')::date AS d
  ),
  res AS (
    SELECT r.id, r.name
    FROM public.resources r
    WHERE r.tenant_id = p_tenant_id
      AND r.active
      AND r.type = 'transport_vehicle'
  ),
  jobs AS (
    SELECT b.resource_id,
           (b.start_at AT TIME ZONE 'Africa/Johannesburg')::date AS d
    FROM public.bookings b
    WHERE b.tenant_id = p_tenant_id
      AND b.service_type = 'pickup_dropoff'
      AND b.status NOT IN ('cancelled','no_show')
      AND (p_exclude_booking_id IS NULL OR b.id <> p_exclude_booking_id)
      AND b.resource_id IS NOT NULL
  ),
  cap AS (
    SELECT COALESCE(max_stops_per_van_per_day, 12) AS m
    FROM public.transport_workflow_settings WHERE tenant_id = p_tenant_id
  )
  SELECT res.id, res.name, days.d,
         COALESCE((SELECT count(*)::int FROM jobs j WHERE j.resource_id = res.id AND j.d = days.d), 0) AS stops,
         COALESCE((SELECT m FROM cap), 12) AS max_stops
  FROM res CROSS JOIN days
  WHERE (SELECT ok FROM allowed)
  ORDER BY res.name, days.d;
$function$;

REVOKE ALL ON FUNCTION public.transport_day_load(uuid, date, date, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.transport_day_load(uuid, date, date, uuid) TO authenticated;