ALTER TABLE public.estimates
  ADD COLUMN IF NOT EXISTS public_token uuid NOT NULL DEFAULT gen_random_uuid();
CREATE UNIQUE INDEX IF NOT EXISTS estimates_public_token_key ON public.estimates(public_token);

ALTER TABLE public.hotel_workflow_settings
  ADD COLUMN IF NOT EXISTS portal_activate_on_quote_accept boolean NOT NULL DEFAULT true;

-- accept_estimate: allow the public-link path (flagged server-side) alongside staff access.
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
BEGIN
  SELECT * INTO v_e FROM public.estimates WHERE id = p_estimate_id;
  IF v_e.id IS NULL THEN RAISE EXCEPTION 'Quote not found'; END IF;
  IF NOT public.user_has_tenant_access(v_e.tenant_id)
     AND COALESCE(current_setting('app.public_quote_accept', true), '') <> 'on' THEN
    RAISE EXCEPTION 'Not allowed';
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
    INSERT INTO public.booking_pets(tenant_id, booking_id, pet_id)
    VALUES (v_e.tenant_id, v_booking, v_pet)
    ON CONFLICT DO NOTHING;
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

-- Read-only view of a quote for the public link.
CREATE OR REPLACE FUNCTION public.get_public_quote(p_token uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_e public.estimates;
  v_items jsonb;
  v_pets jsonb;
  v_tenant jsonb;
  v_customer jsonb;
  v_expired boolean;
BEGIN
  SELECT * INTO v_e FROM public.estimates WHERE public_token = p_token LIMIT 1;
  IF v_e.id IS NULL THEN RETURN NULL; END IF;
  IF v_e.status = 'draft' THEN RETURN NULL; END IF;

  SELECT COALESCE(jsonb_agg(to_jsonb(x) ORDER BY x.sort_order), '[]'::jsonb) INTO v_items
  FROM (SELECT description, quantity, unit_price, line_total, sort_order
        FROM public.estimate_items WHERE estimate_id = v_e.id) x;

  SELECT COALESCE(jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name, 'breed', p.breed)), '[]'::jsonb)
    INTO v_pets
  FROM public.pets p WHERE p.id = ANY (COALESCE(v_e.pet_ids, '{}'::uuid[]));

  SELECT jsonb_build_object('name', t.name, 'primary_colour', t.primary_colour,
                            'contact_email', t.contact_email, 'contact_phone', t.contact_phone)
    INTO v_tenant FROM public.tenants t WHERE t.id = v_e.tenant_id;

  SELECT jsonb_build_object('full_name', c.full_name, 'email', c.email)
    INTO v_customer FROM public.customers c WHERE c.id = v_e.customer_id;

  v_expired := COALESCE(v_e.hold_until, v_e.expiry_date) IS NOT NULL
               AND COALESCE(v_e.hold_until, v_e.expiry_date) < CURRENT_DATE;

  RETURN jsonb_build_object(
    'quote', jsonb_build_object(
      'estimate_number', v_e.estimate_number,
      'status', v_e.status,
      'service_type', v_e.service_type,
      'accommodation_type', v_e.accommodation_type,
      'start_at', v_e.start_at,
      'end_at', v_e.end_at,
      'subtotal', v_e.subtotal,
      'total', v_e.total,
      'notes', v_e.notes,
      'extras', v_e.extras,
      'hold_until', COALESCE(v_e.hold_until, v_e.expiry_date),
      'accepted_at', v_e.accepted_at
    ),
    'items', v_items,
    'pets', v_pets,
    'tenant', v_tenant,
    'customer', v_customer,
    'expired', v_expired,
    'accepted', v_e.status = 'accepted'
  );
END; $$;

REVOKE ALL ON FUNCTION public.get_public_quote(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_quote(uuid) TO anon, authenticated, service_role;

-- Accept a quote from the public link.
CREATE OR REPLACE FUNCTION public.accept_public_quote(p_token uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_e public.estimates;
  v_booking uuid;
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
  v_booking := public.accept_estimate(v_e.id);
  PERFORM set_config('app.public_quote_accept', 'off', true);

  SELECT i.id, i.public_view_token, i.invoice_number
    INTO v_inv
  FROM public.invoices i
  WHERE i.booking_id = v_booking
  ORDER BY i.created_at DESC
  LIMIT 1;

  SELECT COALESCE(h.portal_activate_on_quote_accept, true) INTO v_activate
  FROM public.hotel_workflow_settings h WHERE h.tenant_id = v_e.tenant_id;
  v_activate := COALESCE(v_activate, true);

  SELECT c.email INTO v_email FROM public.customers c WHERE c.id = v_e.customer_id;

  RETURN jsonb_build_object(
    'ok', true,
    'booking_id', v_booking,
    'tenant_id', v_e.tenant_id,
    'customer_id', v_e.customer_id,
    'customer_email', v_email,
    'invoice_id', v_inv.id,
    'invoice_number', v_inv.invoice_number,
    'invoice_token', v_inv.public_view_token,
    'activate_portal', v_activate
  );
END; $$;

REVOKE ALL ON FUNCTION public.accept_public_quote(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.accept_public_quote(uuid) TO anon, authenticated, service_role;