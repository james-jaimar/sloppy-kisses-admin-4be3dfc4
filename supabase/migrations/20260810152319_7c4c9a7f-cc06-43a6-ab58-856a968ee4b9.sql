
-- ============ Transport ============
ALTER TABLE public.transport_workflow_settings
  ADD COLUMN IF NOT EXISTS base_address text,
  ADD COLUMN IF NOT EXISTS base_place_id text,
  ADD COLUMN IF NOT EXISTS base_latitude double precision,
  ADD COLUMN IF NOT EXISTS base_longitude double precision,
  ADD COLUMN IF NOT EXISTS enforce_radius boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS radius_gate_mode text NOT NULL DEFAULT 'warn',
  ADD COLUMN IF NOT EXISTS gate_code_required_by_time time NOT NULL DEFAULT TIME '07:00',
  ADD COLUMN IF NOT EXISTS require_gate_code boolean NOT NULL DEFAULT true;

-- ============ Grooming ============
ALTER TABLE public.grooming_workflow_settings
  ADD COLUMN IF NOT EXISTS sedation_fasting_hours integer NOT NULL DEFAULT 8,
  ADD COLUMN IF NOT EXISTS sedation_instructions_md text,
  ADD COLUMN IF NOT EXISTS sedation_vet_location text,
  ADD COLUMN IF NOT EXISTS senior_pet_age_years integer NOT NULL DEFAULT 8,
  ADD COLUMN IF NOT EXISTS senior_vet_check_mode text NOT NULL DEFAULT 'warn',
  ADD COLUMN IF NOT EXISTS rebook_nudge_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS rebook_weeks_min integer NOT NULL DEFAULT 4,
  ADD COLUMN IF NOT EXISTS rebook_weeks_max integer NOT NULL DEFAULT 6;

-- ============ Hotel ============
ALTER TABLE public.hotel_workflow_settings
  ADD COLUMN IF NOT EXISTS extra_food_fee_zar numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS no_refund_early_checkout boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS photo_policy_note text,
  ADD COLUMN IF NOT EXISTS require_labelling_checklist boolean NOT NULL DEFAULT true;

-- ============ Helpers ============
CREATE OR REPLACE FUNCTION public.distance_km(
  p_lat1 double precision, p_lng1 double precision,
  p_lat2 double precision, p_lng2 double precision
) RETURNS double precision
LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT CASE
    WHEN p_lat1 IS NULL OR p_lng1 IS NULL OR p_lat2 IS NULL OR p_lng2 IS NULL THEN NULL
    ELSE 6371 * 2 * asin(sqrt(
      power(sin(radians(p_lat2 - p_lat1) / 2), 2)
      + cos(radians(p_lat1)) * cos(radians(p_lat2))
      * power(sin(radians(p_lng2 - p_lng1) / 2), 2)
    ))
  END
$$;
REVOKE ALL ON FUNCTION public.distance_km(double precision,double precision,double precision,double precision) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.distance_km(double precision,double precision,double precision,double precision) TO authenticated, service_role;

-- Distance from the tenant depot to a point, plus whether it is inside the transport radius.
CREATE OR REPLACE FUNCTION public.transport_radius_check(
  p_tenant_id uuid, p_lat double precision, p_lng double precision
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  tws public.transport_workflow_settings;
  v_radius numeric;
  v_km double precision;
BEGIN
  IF NOT public.user_has_tenant_access(p_tenant_id) THEN RAISE EXCEPTION 'Not allowed'; END IF;
  SELECT * INTO tws FROM public.transport_workflow_settings WHERE tenant_id = p_tenant_id;
  SELECT COALESCE(transport_radius_km, 20) INTO v_radius FROM public.policy_settings WHERE tenant_id = p_tenant_id;

  v_km := public.distance_km(tws.base_latitude, tws.base_longitude, p_lat, p_lng);

  RETURN jsonb_build_object(
    'has_base', tws.base_latitude IS NOT NULL AND tws.base_longitude IS NOT NULL,
    'radius_km', COALESCE(v_radius, 20),
    'distance_km', v_km,
    'gate_mode', CASE WHEN NOT COALESCE(tws.enforce_radius, true) THEN 'off' ELSE COALESCE(tws.radius_gate_mode, 'warn') END,
    'outside', v_km IS NOT NULL AND v_km > COALESCE(v_radius, 20)
  );
END;
$$;
REVOKE ALL ON FUNCTION public.transport_radius_check(uuid,double precision,double precision) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.transport_radius_check(uuid,double precision,double precision) TO authenticated, service_role;

-- ============ Failed collection ============
CREATE OR REPLACE FUNCTION public.charge_failed_collection(
  p_booking_id uuid, p_note text DEFAULT NULL, p_waive boolean DEFAULT false
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  b public.bookings;
  v_fee numeric(12,2);
  v_inv uuid;
  v_status text;
  v_charged boolean := false;
BEGIN
  SELECT * INTO b FROM public.bookings WHERE id = p_booking_id;
  IF b.id IS NULL THEN RAISE EXCEPTION 'Booking not found'; END IF;
  IF NOT public.user_has_permission(b.tenant_id, 'bookings.edit') THEN RAISE EXCEPTION 'Not allowed'; END IF;

  SELECT COALESCE(failed_collection_fee_zar, 0) INTO v_fee FROM public.policy_settings WHERE tenant_id = b.tenant_id;

  IF NOT p_waive AND COALESCE(v_fee, 0) > 0 THEN
    v_inv := b.invoice_id;
    IF v_inv IS NULL THEN
      SELECT DISTINCT i.id INTO v_inv FROM public.invoice_items ii
        JOIN public.invoices i ON i.id = ii.invoice_id WHERE ii.booking_id = b.id LIMIT 1;
    END IF;
    IF v_inv IS NULL THEN v_inv := public.ensure_booking_invoice(b.id); END IF;

    SELECT status::text INTO v_status FROM public.invoices WHERE id = v_inv;
    IF v_status IN ('paid','cancelled') THEN
      RETURN jsonb_build_object('amount', v_fee, 'charged', false,
        'note', 'Invoice is ' || v_status || ' — raise this separately.');
    END IF;

    INSERT INTO public.invoice_items(
      tenant_id, invoice_id, booking_id, description, quantity, unit_price, line_total,
      sort_order, source_type, source_id
    ) VALUES (
      b.tenant_id, v_inv, b.id,
      'Failed collection — booking ' || COALESCE(b.booking_number,''),
      1, v_fee, v_fee, 96, 'failed_collection', b.id
    );
    v_charged := true;
  END IF;

  UPDATE public.bookings
     SET status = 'no_show',
         notes_internal = COALESCE(notes_internal || E'\n','')
           || to_char(now() AT TIME ZONE 'Africa/Johannesburg','DD Mon YYYY HH24:MI')
           || ' — failed collection'
           || CASE WHEN v_charged THEN ' (R' || to_char(v_fee,'FM999999990.00') || ' charged)' ELSE ' (fee waived)' END
           || COALESCE(' — ' || p_note, ''),
         updated_at = now()
   WHERE id = b.id;

  RETURN jsonb_build_object('amount', COALESCE(v_fee,0), 'charged', v_charged);
END;
$$;
REVOKE ALL ON FUNCTION public.charge_failed_collection(uuid,text,boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.charge_failed_collection(uuid,text,boolean) TO authenticated, service_role;

-- ============ Hotel extra food (Deli) at check-out ============
CREATE OR REPLACE FUNCTION public.charge_hotel_extra_food(
  p_booking_id uuid, p_days numeric DEFAULT 1, p_note text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  b public.bookings;
  v_rate numeric(12,2);
  v_total numeric(12,2);
  v_inv uuid;
  v_status text;
BEGIN
  SELECT * INTO b FROM public.bookings WHERE id = p_booking_id;
  IF b.id IS NULL THEN RAISE EXCEPTION 'Booking not found'; END IF;
  IF NOT public.user_has_permission(b.tenant_id, 'bookings.edit') THEN RAISE EXCEPTION 'Not allowed'; END IF;
  IF COALESCE(p_days, 0) <= 0 THEN RAISE EXCEPTION 'Days must be greater than zero'; END IF;

  SELECT COALESCE(extra_food_fee_zar, 0) INTO v_rate FROM public.hotel_workflow_settings WHERE tenant_id = b.tenant_id;
  IF COALESCE(v_rate, 0) <= 0 THEN
    RETURN jsonb_build_object('charged', false, 'note', 'No extra food day rate is set in hotel settings.');
  END IF;
  v_total := round(v_rate * p_days, 2);

  v_inv := b.invoice_id;
  IF v_inv IS NULL THEN
    SELECT DISTINCT i.id INTO v_inv FROM public.invoice_items ii
      JOIN public.invoices i ON i.id = ii.invoice_id WHERE ii.booking_id = b.id LIMIT 1;
  END IF;
  IF v_inv IS NULL THEN v_inv := public.ensure_booking_invoice(b.id); END IF;

  SELECT status::text INTO v_status FROM public.invoices WHERE id = v_inv;
  IF v_status IN ('paid','cancelled') THEN
    RETURN jsonb_build_object('amount', v_total, 'charged', false,
      'note', 'Invoice is ' || v_status || ' — raise this separately.');
  END IF;

  INSERT INTO public.invoice_items(
    tenant_id, invoice_id, booking_id, description, quantity, unit_price, line_total,
    sort_order, source_type, source_id
  ) VALUES (
    b.tenant_id, v_inv, b.id,
    'Deli food supplied' || COALESCE(' — ' || p_note, '') || ' (booking ' || COALESCE(b.booking_number,'') || ')',
    p_days, v_rate, v_total, 97, 'hotel_extra_food', b.id
  );

  RETURN jsonb_build_object('amount', v_total, 'rate', v_rate, 'days', p_days, 'charged', true);
END;
$$;
REVOKE ALL ON FUNCTION public.charge_hotel_extra_food(uuid,numeric,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.charge_hotel_extra_food(uuid,numeric,text) TO authenticated, service_role;

-- ============ Early check-out (no refund) ============
CREATE OR REPLACE FUNCTION public.hotel_early_checkout(
  p_booking_id uuid, p_collected_at timestamptz DEFAULT now(), p_note text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  b public.bookings;
  v_no_refund boolean;
  v_nights_unused int;
BEGIN
  SELECT * INTO b FROM public.bookings WHERE id = p_booking_id;
  IF b.id IS NULL THEN RAISE EXCEPTION 'Booking not found'; END IF;
  IF NOT public.user_has_permission(b.tenant_id, 'bookings.edit') THEN RAISE EXCEPTION 'Not allowed'; END IF;

  SELECT COALESCE(no_refund_early_checkout, true) INTO v_no_refund
    FROM public.hotel_workflow_settings WHERE tenant_id = b.tenant_id;

  v_nights_unused := GREATEST(0, (b.end_at::date - p_collected_at::date));

  UPDATE public.bookings
     SET status = 'checked_out',
         checked_out_at = p_collected_at,
         notes_internal = COALESCE(notes_internal || E'\n','')
           || to_char(p_collected_at AT TIME ZONE 'Africa/Johannesburg','DD Mon YYYY HH24:MI')
           || ' — early check-out, ' || v_nights_unused || ' night(s) unused'
           || CASE WHEN v_no_refund THEN ' (no refund per T&Cs)' ELSE '' END
           || COALESCE(' — ' || p_note, ''),
         updated_at = now()
   WHERE id = b.id;

  RETURN jsonb_build_object('nights_unused', v_nights_unused, 'no_refund', v_no_refund);
END;
$$;
REVOKE ALL ON FUNCTION public.hotel_early_checkout(uuid,timestamptz,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.hotel_early_checkout(uuid,timestamptz,text) TO authenticated, service_role;
