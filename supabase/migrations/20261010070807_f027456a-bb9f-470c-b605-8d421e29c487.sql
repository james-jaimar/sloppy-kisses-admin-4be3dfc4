CREATE OR REPLACE FUNCTION public.public_grooming_slots(p_tenant_id uuid, p_day date, p_kind text, p_minutes int)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_type text := CASE WHEN p_kind = 'mobile' THEN 'mobile_van' ELSE 'inhouse_grooming' END;
  v_svc text := CASE WHEN p_kind = 'mobile' THEN 'grooming_mobile' ELSE 'grooming_inhouse' END;
  v_mins int := LEAST(GREATEST(COALESCE(p_minutes, 60), 15), 480);
  v_closed text;
  v_slots jsonb;
BEGIN
  IF p_day < (now() AT TIME ZONE 'Africa/Johannesburg')::date OR p_day > (now() AT TIME ZONE 'Africa/Johannesburg')::date + 180 THEN
    RETURN jsonb_build_object('closed', 'Not bookable online', 'slots', '[]'::jsonb);
  END IF;
  SELECT c.name INTO v_closed FROM closures c
   WHERE c.tenant_id = p_tenant_id AND p_day BETWEEN c.start_date AND c.end_date
     AND (c.services IS NULL OR cardinality(c.services) = 0
          OR EXISTS (SELECT 1 FROM unnest(c.services) s WHERE s::text LIKE 'grooming%'))
   LIMIT 1;
  IF FOUND THEN
    RETURN jsonb_build_object('closed', COALESCE(v_closed, 'Closed'), 'slots', '[]'::jsonb);
  END IF;

  WITH res AS (
    SELECT r.id, COALESCE(r.workday_start::time, '08:00') ws, COALESCE(r.workday_end::time, '17:00') we
    FROM resources r WHERE r.tenant_id = p_tenant_id AND r.active AND r.type::text = v_type
  ), win AS (SELECT min(ws) ws, max(we) we FROM res),
  cand AS (
    SELECT t AS st
    FROM win, generate_series(p_day + win.ws, p_day + win.we - make_interval(mins => v_mins), interval '30 minutes') t
  ), busy AS (
    SELECT b.resource_id, b.start_at, b.end_at FROM bookings b
    WHERE b.tenant_id = p_tenant_id AND b.service_type::text = v_svc
      AND b.status::text NOT IN ('cancelled','no_show')
      AND b.start_at < ((p_day + 1)::timestamp AT TIME ZONE 'Africa/Johannesburg')
      AND b.end_at > (p_day::timestamp AT TIME ZONE 'Africa/Johannesburg')
  ), free AS (
    SELECT c.st,
      (SELECT count(*) FROM res r
        WHERE c.st::time >= r.ws AND (c.st + make_interval(mins => v_mins))::time <= r.we
          AND NOT EXISTS (SELECT 1 FROM busy x WHERE x.resource_id = r.id
              AND x.start_at < ((c.st + make_interval(mins => v_mins)) AT TIME ZONE 'Africa/Johannesburg')
              AND x.end_at > (c.st AT TIME ZONE 'Africa/Johannesburg')))
      - (SELECT count(*) FROM busy x WHERE x.resource_id IS NULL
              AND x.start_at < ((c.st + make_interval(mins => v_mins)) AT TIME ZONE 'Africa/Johannesburg')
              AND x.end_at > (c.st AT TIME ZONE 'Africa/Johannesburg')) AS n
    FROM cand c
    WHERE (c.st AT TIME ZONE 'Africa/Johannesburg') > now() + interval '2 hours'
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object('time', to_char(st, 'HH24:MI'), 'free', n) ORDER BY st), '[]'::jsonb)
  INTO v_slots FROM free WHERE n > 0;

  RETURN jsonb_build_object('closed', NULL, 'slots', v_slots);
END;
$$;