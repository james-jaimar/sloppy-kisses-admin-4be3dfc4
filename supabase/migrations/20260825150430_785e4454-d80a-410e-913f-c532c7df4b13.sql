ALTER TABLE public.estimates
  ADD COLUMN IF NOT EXISTS enrolment_id uuid REFERENCES public.daycare_enrolments(id) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION public.accept_daycare_estimate(p_estimate_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_e public.estimates;
  v_pet uuid;
  v_enrol uuid;
  v_first uuid;
  v_plan uuid;
  v_days text[];
  v_start date;
  v_waive boolean;
BEGIN
  SELECT * INTO v_e FROM public.estimates WHERE id = p_estimate_id;
  IF v_e.id IS NULL THEN RAISE EXCEPTION 'Quote not found'; END IF;
  IF v_e.enrolment_id IS NOT NULL THEN RETURN v_e.enrolment_id; END IF;

  v_plan  := NULLIF(v_e.extras->>'daycare_plan_id','')::uuid;
  v_start := COALESCE(NULLIF(v_e.extras->>'start_date','')::date, v_e.start_at::date, CURRENT_DATE);
  v_waive := COALESCE((v_e.extras->>'assessment_waived')::boolean, false);

  SELECT COALESCE(array_agg(x), '{}'::text[]) INTO v_days
  FROM jsonb_array_elements_text(COALESCE(v_e.extras->'weekdays','[]'::jsonb)) x;

  IF array_length(v_days, 1) IS NULL THEN
    RAISE EXCEPTION 'This quote has no attendance days on it';
  END IF;

  FOREACH v_pet IN ARRAY COALESCE(v_e.pet_ids, '{}'::uuid[]) LOOP
    INSERT INTO public.daycare_enrolments(
      tenant_id, customer_id, pet_id, daycare_plan_id, selected_days,
      start_date, active, assessment_waived, notes)
    VALUES (
      v_e.tenant_id, v_e.customer_id, v_pet, v_plan, v_days,
      v_start, true, v_waive,
      'Created from quote ' || COALESCE(v_e.estimate_number,''))
    RETURNING id INTO v_enrol;
    IF v_first IS NULL THEN v_first := v_enrol; END IF;
  END LOOP;

  IF v_first IS NULL THEN RAISE EXCEPTION 'This quote has no pets on it'; END IF;

  UPDATE public.estimates
     SET status = 'accepted', accepted_at = now(), enrolment_id = v_first, updated_at = now()
   WHERE id = p_estimate_id;

  RETURN v_first;
END; $function$;

REVOKE ALL ON FUNCTION public.accept_daycare_estimate(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.accept_daycare_estimate(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.accept_daycare_estimate(uuid) FROM authenticated;

CREATE OR REPLACE FUNCTION public.accept_estimate(p_estimate_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_e public.estimates;
  v_booking uuid;
  v_num text;
  v_pet uuid;
  v_s jsonb;
  v_idx integer := 0;
  v_acc text;
BEGIN
  SELECT * INTO v_e FROM public.estimates WHERE id = p_estimate_id;
  IF v_e.id IS NULL THEN RAISE EXCEPTION 'Quote not found'; END IF;
  IF NOT public.user_has_tenant_access(v_e.tenant_id)
     AND COALESCE(current_setting('app.public_quote_accept', true), '') <> 'on' THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;

  -- Daycare quotes become an enrolment, not a booking.
  IF v_e.service_type = 'daycare'::public.service_type THEN
    RETURN public.accept_daycare_estimate(p_estimate_id);
  END IF;

  IF v_e.booking_id IS NOT NULL THEN RETURN v_e.booking_id; END IF;
  IF v_e.start_at IS NULL THEN RAISE EXCEPTION 'Quote has no stay dates'; END IF;

  v_num := public.next_booking_number(v_e.tenant_id);

  INSERT INTO public.bookings(
    tenant_id, customer_id, booking_number, service_type, status,
    start_at, end_at, start_date, end_date, source, notes)
  VALUES (
    v_e.tenant_id, v_e.customer_id, v_num,
    COALESCE(v_e.service_type, 'hotel_dog'::public.service_type), 'confirmed',
    v_e.start_at, v_e.end_at, v_e.start_at::date, v_e.end_at::date,
    'staff_capture', 'Created from quote ' || COALESCE(v_e.estimate_number,''))
  RETURNING id INTO v_booking;

  FOREACH v_pet IN ARRAY COALESCE(v_e.pet_ids, '{}'::uuid[]) LOOP
    SELECT NULLIF(e->>'accommodation_type','') INTO v_acc
      FROM jsonb_array_elements(COALESCE(v_e.extras->'pets','[]'::jsonb)) e
     WHERE (e->>'pet_id')::uuid = v_pet
     LIMIT 1;

    INSERT INTO public.booking_pets(tenant_id, booking_id, pet_id, accommodation_type, sort_order)
    VALUES (v_e.tenant_id, v_booking, v_pet, COALESCE(v_acc, v_e.accommodation_type), v_idx)
    ON CONFLICT DO NOTHING;
    v_idx := v_idx + 1;
  END LOOP;

  INSERT INTO public.hotel_booking_details(
    tenant_id, booking_id, accommodation_type,
    check_in_window, check_out_window, additional_notes)
  VALUES (
    v_e.tenant_id, v_booking, v_e.accommodation_type,
    NULLIF(v_e.extras->>'check_in_window',''),
    NULLIF(v_e.extras->>'check_out_window',''),
    NULLIF(v_e.extras->>'notes',''));

  FOR v_s IN SELECT * FROM jsonb_array_elements(COALESCE(v_e.extras->'surcharges','[]'::jsonb))
  LOOP
    INSERT INTO public.hotel_booking_surcharges(tenant_id, booking_id, surcharge_id, quantity)
    VALUES (v_e.tenant_id, v_booking, (v_s->>'surcharge_id')::uuid,
            COALESCE((v_s->>'quantity')::numeric, 1));
  END LOOP;

  IF COALESCE(v_e.extras->'pets', '[]'::jsonb) <> '[]'::jsonb THEN
    PERFORM public.sync_hotel_grooming_requests(v_booking, jsonb_build_object('pets', v_e.extras->'pets'));
  END IF;

  UPDATE public.estimates
     SET status = 'accepted', accepted_at = now(), booking_id = v_booking, updated_at = now()
   WHERE id = p_estimate_id;

  RETURN v_booking;
END; $function$;

CREATE OR REPLACE FUNCTION public.accept_public_quote(p_token uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_e public.estimates;
  v_booking uuid;
  v_enrol uuid;
  v_inv record;
  v_activate boolean;
  v_email text;
BEGIN
  SELECT * INTO v_e FROM public.estimates WHERE public_token = p_token LIMIT 1;
  IF v_e.id IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'This quote link is not valid.'); END IF;

  IF v_e.status = 'cancelled' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'This quote has been cancelled.');
  END IF;

  IF v_e.status <> 'accepted'
     AND COALESCE(v_e.hold_until, v_e.expiry_date) IS NOT NULL
     AND COALESCE(v_e.hold_until, v_e.expiry_date) < CURRENT_DATE THEN
    RETURN jsonb_build_object('ok', false, 'error', 'This quote has expired — please request a new one.');
  END IF;

  PERFORM set_config('app.public_quote_accept', 'on', true);

  IF v_e.service_type = 'daycare'::public.service_type THEN
    v_enrol := public.accept_daycare_estimate(v_e.id);
    PERFORM set_config('app.public_quote_accept', 'off', true);

    SELECT i.id, i.public_view_token, i.invoice_number
      INTO v_inv
    FROM public.invoice_items it
    JOIN public.invoices i ON i.id = it.invoice_id
    WHERE it.source_type = 'daycare_enrolment_prorata' AND it.source_id = v_enrol
    ORDER BY i.created_at DESC
    LIMIT 1;
  ELSE
    v_booking := public.accept_estimate(v_e.id);
    PERFORM set_config('app.public_quote_accept', 'off', true);

    SELECT i.id, i.public_view_token, i.invoice_number
      INTO v_inv
    FROM public.invoices i
    WHERE i.booking_id = v_booking
    ORDER BY i.created_at DESC
    LIMIT 1;
  END IF;

  SELECT COALESCE(h.portal_activate_on_quote_accept, true) INTO v_activate
  FROM public.hotel_workflow_settings h WHERE h.tenant_id = v_e.tenant_id;
  v_activate := COALESCE(v_activate, true);

  SELECT c.email INTO v_email FROM public.customers c WHERE c.id = v_e.customer_id;

  RETURN jsonb_build_object(
    'ok', true,
    'booking_id', v_booking,
    'enrolment_id', v_enrol,
    'tenant_id', v_e.tenant_id,
    'customer_id', v_e.customer_id,
    'customer_email', v_email,
    'invoice_id', v_inv.id,
    'invoice_number', v_inv.invoice_number,
    'invoice_token', v_inv.public_view_token,
    'activate_portal', v_activate
  );
END; $function$;