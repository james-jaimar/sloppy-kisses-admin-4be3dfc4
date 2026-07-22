
-- 1. Extend transport_workflow_settings with pricing
ALTER TABLE public.transport_workflow_settings
  ADD COLUMN IF NOT EXISTS default_fee_zar numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS round_trip_multiplier numeric(6,3) NOT NULL DEFAULT 1.8,
  ADD COLUMN IF NOT EXISTS suburb_fees jsonb NOT NULL DEFAULT '{}'::jsonb;

-- 2. Rewrite transport auto-invoice to price the line from settings
CREATE OR REPLACE FUNCTION public.transport_details_auto_invoice()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_booking public.bookings; v_inv uuid; v_sort integer;
  v_ps date; v_pe date; v_period_label text; v_anchor date;
  v_settings public.transport_workflow_settings;
  v_base numeric(12,2) := 0;
  v_mult numeric(6,3) := 1;
  v_price numeric(12,2) := 0;
  v_suburb text;
  v_pet_name text;
BEGIN
  SELECT * INTO v_booking FROM public.bookings WHERE id = NEW.booking_id;
  IF v_booking.id IS NULL THEN RETURN NEW; END IF;

  -- Strip any prior auto lines so recalculation stays clean
  IF v_booking.invoice_id IS NOT NULL THEN
    DELETE FROM public.invoice_items
      WHERE invoice_id = v_booking.invoice_id
        AND booking_id = v_booking.id
        AND description LIKE 'Transport — %';
  END IF;

  IF NOT COALESCE(public._auto_invoice_enabled(NEW.tenant_id, 'transport'), true) THEN RETURN NEW; END IF;

  SELECT * INTO v_settings FROM public.transport_workflow_settings WHERE tenant_id = NEW.tenant_id LIMIT 1;
  v_base := COALESCE(v_settings.default_fee_zar, 0);
  v_mult := COALESCE(v_settings.round_trip_multiplier, 1.8);

  v_suburb := COALESCE(NEW.suburb, '');
  IF v_suburb <> '' AND v_settings.suburb_fees ? v_suburb THEN
    v_price := (v_settings.suburb_fees ->> v_suburb)::numeric;
  ELSE
    v_price := v_base;
  END IF;
  IF NEW.direction = 'round_trip' THEN
    v_price := v_price * v_mult;
  END IF;

  v_anchor := COALESCE(v_booking.start_at::date, now()::date);
  SELECT period_start, period_end INTO v_ps, v_pe FROM public._period_bounds(v_anchor);
  v_period_label := to_char(v_ps, 'Mon YYYY');

  v_inv := public.ensure_draft_invoice(v_booking.tenant_id, v_booking.customer_id, v_ps, v_pe, 'Services — ' || v_period_label);
  UPDATE public.bookings SET invoice_id = v_inv WHERE id = v_booking.id AND invoice_id IS NULL;

  SELECT p.name INTO v_pet_name
  FROM public.booking_pets bp JOIN public.pets p ON p.id = bp.pet_id
  WHERE bp.booking_id = v_booking.id LIMIT 1;

  SELECT COALESCE(MAX(sort_order),0)+1 INTO v_sort FROM public.invoice_items WHERE invoice_id = v_inv;

  INSERT INTO public.invoice_items(tenant_id, invoice_id, booking_id, description, quantity, unit_price, sort_order)
  VALUES (v_booking.tenant_id, v_inv, v_booking.id,
    'Transport — ' || COALESCE(NEW.direction, 'trip')
      || CASE WHEN v_suburb <> '' THEN ' · ' || v_suburb ELSE '' END
      || CASE WHEN v_pet_name IS NOT NULL THEN ' (' || v_pet_name || ')' ELSE '' END,
    1, v_price, v_sort);

  RETURN NEW;
END;
$function$;

-- 3. Van assign check: min gap + overlap detection
CREATE OR REPLACE FUNCTION public.van_can_assign_stop(_booking_id uuid, _resource_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_b public.bookings;
  v_min int; v_max int;
  v_prev record; v_next record;
  v_gap_prev int; v_gap_next int;
  v_warn text[] := ARRAY[]::text[];
BEGIN
  SELECT * INTO v_b FROM public.bookings WHERE id = _booking_id;
  IF v_b.id IS NULL THEN RETURN jsonb_build_object('ok', false, 'reason', 'booking_not_found'); END IF;

  SELECT COALESCE(min_travel_gap_minutes, 15), COALESCE(max_travel_gap_minutes, 90)
    INTO v_min, v_max
  FROM public.van_workflow_settings WHERE tenant_id = v_b.tenant_id LIMIT 1;
  v_min := COALESCE(v_min, 15); v_max := COALESCE(v_max, 90);

  -- Overlap check
  IF EXISTS (
    SELECT 1 FROM public.bookings b
    WHERE b.tenant_id = v_b.tenant_id
      AND b.resource_id = _resource_id
      AND b.id <> _booking_id
      AND b.status NOT IN ('cancelled','no_show')
      AND tstzrange(b.start_at, COALESCE(b.end_at, b.start_at + interval '30 min'), '[)') &&
          tstzrange(v_b.start_at, COALESCE(v_b.end_at, v_b.start_at + interval '30 min'), '[)')
  ) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'overlap');
  END IF;

  SELECT b.end_at, b.start_at INTO v_prev
  FROM public.bookings b
  WHERE b.tenant_id = v_b.tenant_id AND b.resource_id = _resource_id
    AND b.id <> _booking_id AND b.status NOT IN ('cancelled','no_show')
    AND b.start_at < v_b.start_at
  ORDER BY b.start_at DESC LIMIT 1;

  SELECT b.start_at, b.end_at INTO v_next
  FROM public.bookings b
  WHERE b.tenant_id = v_b.tenant_id AND b.resource_id = _resource_id
    AND b.id <> _booking_id AND b.status NOT IN ('cancelled','no_show')
    AND b.start_at > v_b.start_at
  ORDER BY b.start_at ASC LIMIT 1;

  IF v_prev.end_at IS NOT NULL THEN
    v_gap_prev := EXTRACT(EPOCH FROM (v_b.start_at - v_prev.end_at))/60;
    IF v_gap_prev < v_min THEN v_warn := array_append(v_warn, format('Only %s min gap after previous stop (min %s)', v_gap_prev, v_min)); END IF;
    IF v_gap_prev > v_max THEN v_warn := array_append(v_warn, format('%s min idle after previous stop (max %s)', v_gap_prev, v_max)); END IF;
  END IF;

  IF v_next.start_at IS NOT NULL AND v_b.end_at IS NOT NULL THEN
    v_gap_next := EXTRACT(EPOCH FROM (v_next.start_at - v_b.end_at))/60;
    IF v_gap_next < v_min THEN v_warn := array_append(v_warn, format('Only %s min gap before next stop (min %s)', v_gap_next, v_min)); END IF;
    IF v_gap_next > v_max THEN v_warn := array_append(v_warn, format('%s min idle before next stop (max %s)', v_gap_next, v_max)); END IF;
  END IF;

  RETURN jsonb_build_object('ok', true, 'warnings', to_jsonb(v_warn));
END;
$function$;

-- 4. Transport assign check (same shape)
CREATE OR REPLACE FUNCTION public.transport_can_assign_leg(_booking_id uuid, _resource_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_b public.bookings;
  v_min int; v_max int;
  v_prev record; v_next record;
  v_gap_prev int; v_gap_next int;
  v_warn text[] := ARRAY[]::text[];
BEGIN
  SELECT * INTO v_b FROM public.bookings WHERE id = _booking_id;
  IF v_b.id IS NULL THEN RETURN jsonb_build_object('ok', false, 'reason', 'booking_not_found'); END IF;

  SELECT COALESCE(min_leg_gap_minutes, 15), COALESCE(max_leg_gap_minutes, 120)
    INTO v_min, v_max
  FROM public.transport_workflow_settings WHERE tenant_id = v_b.tenant_id LIMIT 1;
  v_min := COALESCE(v_min, 15); v_max := COALESCE(v_max, 120);

  IF EXISTS (
    SELECT 1 FROM public.bookings b
    WHERE b.tenant_id = v_b.tenant_id
      AND b.resource_id = _resource_id
      AND b.id <> _booking_id
      AND b.status NOT IN ('cancelled','no_show')
      AND tstzrange(b.start_at, COALESCE(b.end_at, b.start_at + interval '30 min'), '[)') &&
          tstzrange(v_b.start_at, COALESCE(v_b.end_at, v_b.start_at + interval '30 min'), '[)')
  ) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'overlap');
  END IF;

  SELECT b.end_at, b.start_at INTO v_prev
  FROM public.bookings b
  WHERE b.tenant_id = v_b.tenant_id AND b.resource_id = _resource_id
    AND b.id <> _booking_id AND b.status NOT IN ('cancelled','no_show')
    AND b.start_at < v_b.start_at
  ORDER BY b.start_at DESC LIMIT 1;

  SELECT b.start_at INTO v_next
  FROM public.bookings b
  WHERE b.tenant_id = v_b.tenant_id AND b.resource_id = _resource_id
    AND b.id <> _booking_id AND b.status NOT IN ('cancelled','no_show')
    AND b.start_at > v_b.start_at
  ORDER BY b.start_at ASC LIMIT 1;

  IF v_prev.end_at IS NOT NULL THEN
    v_gap_prev := EXTRACT(EPOCH FROM (v_b.start_at - v_prev.end_at))/60;
    IF v_gap_prev < v_min THEN v_warn := array_append(v_warn, format('Only %s min gap after previous leg (min %s)', v_gap_prev, v_min)); END IF;
    IF v_gap_prev > v_max THEN v_warn := array_append(v_warn, format('%s min idle after previous leg (max %s)', v_gap_prev, v_max)); END IF;
  END IF;

  IF v_next.start_at IS NOT NULL AND v_b.end_at IS NOT NULL THEN
    v_gap_next := EXTRACT(EPOCH FROM (v_next.start_at - v_b.end_at))/60;
    IF v_gap_next < v_min THEN v_warn := array_append(v_warn, format('Only %s min gap before next leg (min %s)', v_gap_next, v_min)); END IF;
    IF v_gap_next > v_max THEN v_warn := array_append(v_warn, format('%s min idle before next leg (max %s)', v_gap_next, v_max)); END IF;
  END IF;

  RETURN jsonb_build_object('ok', true, 'warnings', to_jsonb(v_warn));
END;
$function$;

REVOKE ALL ON FUNCTION public.van_can_assign_stop(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.transport_can_assign_leg(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.van_can_assign_stop(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.transport_can_assign_leg(uuid, uuid) TO authenticated;
