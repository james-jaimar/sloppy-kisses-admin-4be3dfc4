CREATE OR REPLACE FUNCTION public.public_daycare_info(p_tenant_id uuid, p_day date DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_plans jsonb; v_full boolean := false; v_closed text; v_exp int; v_cap int;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM tenants WHERE id = p_tenant_id AND status = 'active') THEN RETURN NULL; END IF;
  SELECT COALESCE(jsonb_agg(jsonb_build_object('id', id, 'name', name, 'days_per_week', days_per_week,
    'price', price, 'billing_period', billing_period) ORDER BY sort_order), '[]'::jsonb)
  INTO v_plans FROM daycare_plans WHERE tenant_id = p_tenant_id AND active;
  IF p_day IS NOT NULL THEN
    SELECT expected, capacity INTO v_exp, v_cap FROM daycare_day_availability(p_tenant_id, p_day, p_day) LIMIT 1;
    v_full := v_cap IS NOT NULL AND v_exp >= v_cap;
    SELECT name INTO v_closed FROM closures WHERE tenant_id = p_tenant_id AND p_day BETWEEN start_date AND end_date LIMIT 1;
  END IF;
  RETURN jsonb_build_object('plans', v_plans, 'day_full', v_full, 'closed', v_closed,
    'weekend', p_day IS NOT NULL AND extract(isodow FROM p_day) >= 6);
EXCEPTION WHEN undefined_column THEN
  RETURN jsonb_build_object('plans', COALESCE(v_plans,'[]'::jsonb), 'day_full', v_full, 'closed', NULL, 'weekend', p_day IS NOT NULL AND extract(isodow FROM p_day) >= 6);
END $$;

CREATE OR REPLACE FUNCTION public.public_transport_info(p_tenant_id uuid, p_day date DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE s record; v_vans int; v_stops int;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM tenants WHERE id = p_tenant_id AND status = 'active') THEN RETURN NULL; END IF;
  SELECT default_fee_zar, round_trip_multiplier, suburb_fees, COALESCE(max_stops_per_van_per_day, 12) AS m,
         day_start_time, day_end_time
    INTO s FROM transport_workflow_settings WHERE tenant_id = p_tenant_id;
  SELECT count(*) INTO v_vans FROM resources WHERE tenant_id = p_tenant_id AND active AND type = 'transport_vehicle';
  IF p_day IS NOT NULL THEN
    SELECT count(*) INTO v_stops FROM bookings b WHERE b.tenant_id = p_tenant_id AND b.service_type = 'pickup_dropoff'
      AND b.status NOT IN ('cancelled','no_show') AND (b.start_at AT TIME ZONE 'Africa/Johannesburg')::date = p_day;
  END IF;
  RETURN jsonb_build_object(
    'default_fee_zar', COALESCE(s.default_fee_zar, 0),
    'round_trip_multiplier', COALESCE(s.round_trip_multiplier, 2),
    'suburb_fees', COALESCE(s.suburb_fees, '{}'::jsonb),
    'day_start', to_char(COALESCE(s.day_start_time, '07:00'::time), 'HH24:MI'),
    'day_end', to_char(COALESCE(s.day_end_time, '17:00'::time), 'HH24:MI'),
    'day_full', p_day IS NOT NULL AND v_vans > 0 AND COALESCE(v_stops,0) >= v_vans * COALESCE(s.m, 12),
    'no_vans', v_vans = 0);
END $$;

REVOKE ALL ON FUNCTION public.public_daycare_info(uuid, date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.public_transport_info(uuid, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.public_daycare_info(uuid, date) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.public_transport_info(uuid, date) TO anon, authenticated, service_role;