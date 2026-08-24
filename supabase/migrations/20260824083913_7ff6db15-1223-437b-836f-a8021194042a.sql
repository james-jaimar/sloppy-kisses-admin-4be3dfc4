CREATE OR REPLACE FUNCTION public.hotel_house_availability(
  p_tenant_id uuid,
  p_start date,
  p_end date,
  p_species text DEFAULT 'dog'
)
 RETURNS TABLE(day date, capacity integer, used integer)
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
  cap AS (
    SELECT COALESCE(sum(r.capacity), 0)::int AS total
    FROM public.resources r
    WHERE r.tenant_id = p_tenant_id
      AND r.active
      AND r.type::text = CASE WHEN p_species = 'cat' THEN 'cattery_area' ELSE 'hotel_area' END
  ),
  stays AS (
    SELECT b.id,
           (b.start_at AT TIME ZONE 'Africa/Johannesburg')::date AS s,
           COALESCE((b.end_at AT TIME ZONE 'Africa/Johannesburg')::date,
                    (b.start_at AT TIME ZONE 'Africa/Johannesburg')::date + 1) AS e
    FROM public.bookings b
    WHERE b.tenant_id = p_tenant_id
      AND b.service_type::text = CASE WHEN p_species = 'cat' THEN 'hotel_cat' ELSE 'hotel_dog' END
      AND b.status::text NOT IN ('cancelled','no_show','completed','checked_out')
  ),
  occ AS (
    SELECT st.s, st.e, GREATEST(1, (SELECT count(*) FROM public.booking_pets bp WHERE bp.booking_id = st.id))::int AS pets
    FROM stays st
  )
  SELECT days.d,
         (SELECT total FROM cap) AS capacity,
         COALESCE((SELECT sum(o.pets)::int FROM occ o WHERE days.d >= o.s AND days.d < o.e), 0) AS used
  FROM days
  WHERE (SELECT ok FROM allowed)
  ORDER BY days.d;
$function$;

REVOKE ALL ON FUNCTION public.hotel_house_availability(uuid, date, date, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hotel_house_availability(uuid, date, date, text) TO authenticated;