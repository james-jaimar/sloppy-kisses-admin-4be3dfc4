ALTER TABLE public.hotel_workflow_settings
  ADD COLUMN IF NOT EXISTS overbooking_mode text NOT NULL DEFAULT 'warn';

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'hotel_workflow_settings_overbooking_mode_chk') THEN
    ALTER TABLE public.hotel_workflow_settings
      ADD CONSTRAINT hotel_workflow_settings_overbooking_mode_chk CHECK (overbooking_mode IN ('warn','block'));
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.hotel_day_availability(
  p_tenant_id uuid,
  p_start date,
  p_end date,
  p_exclude_booking_id uuid DEFAULT NULL
)
RETURNS TABLE(resource_id uuid, resource_name text, capacity integer, day date, used integer)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH days AS (
    SELECT generate_series(p_start, GREATEST(p_start, p_end - 1), interval '1 day')::date AS d
  ),
  res AS (
    SELECT r.id, r.name, r.capacity
    FROM public.resources r
    WHERE r.tenant_id = p_tenant_id
      AND r.active
      AND r.type IN ('hotel_area','cattery_area')
  ),
  occ AS (
    SELECT b.resource_id,
           (b.start_at AT TIME ZONE 'Africa/Johannesburg')::date AS s,
           COALESCE((b.end_at AT TIME ZONE 'Africa/Johannesburg')::date, (b.start_at AT TIME ZONE 'Africa/Johannesburg')::date + 1) AS e,
           GREATEST(1, (SELECT count(*) FROM public.booking_pets bp WHERE bp.booking_id = b.id))::int AS pet_count
    FROM public.bookings b
    WHERE b.tenant_id = p_tenant_id
      AND b.service_type IN ('hotel_dog','hotel_cat')
      AND b.status NOT IN ('cancelled','no_show','completed','checked_out')
      AND (p_exclude_booking_id IS NULL OR b.id <> p_exclude_booking_id)
      AND b.resource_id IS NOT NULL
  )
  SELECT res.id, res.name, res.capacity, days.d,
         COALESCE((
           SELECT sum(o.pet_count)::int FROM occ o
           WHERE o.resource_id = res.id AND days.d >= o.s AND days.d < o.e
         ), 0) AS used
  FROM res CROSS JOIN days
  WHERE public.user_has_tenant_access(p_tenant_id)
  ORDER BY res.name, days.d;
$$;

REVOKE ALL ON FUNCTION public.hotel_day_availability(uuid, date, date, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hotel_day_availability(uuid, date, date, uuid) TO authenticated, service_role;