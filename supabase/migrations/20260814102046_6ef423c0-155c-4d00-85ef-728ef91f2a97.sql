-- 1. Gate the checkout-groom discount on a real link to a hotel stay
CREATE OR REPLACE FUNCTION public.grooming_checkout_discount_pct(p_booking_id uuid)
RETURNS numeric LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_b public.bookings;
  v_pct numeric(5,2);
  v_day date;
BEGIN
  SELECT * INTO v_b FROM public.bookings WHERE id = p_booking_id;
  IF v_b.id IS NULL THEN RETURN 0; END IF;
  IF v_b.service_type::text NOT IN ('grooming_inhouse','grooming_mobile') THEN RETURN 0; END IF;

  SELECT COALESCE(checkout_groom_discount_pct, 0) INTO v_pct
    FROM public.hotel_workflow_settings WHERE tenant_id = v_b.tenant_id LIMIT 1;
  IF COALESCE(v_pct,0) <= 0 THEN RETURN 0; END IF;

  v_day := COALESCE(v_b.start_date, v_b.start_at::date);

  -- Only grooms created from a hotel stay (linked via hotel_grooming_requests)
  -- and happening on that stay's checkout day qualify.
  IF EXISTS (
    SELECT 1
      FROM public.hotel_grooming_requests r
      JOIN public.bookings h ON h.id = r.hotel_booking_id
     WHERE r.grooming_booking_id = v_b.id
       AND r.tenant_id = v_b.tenant_id
       AND COALESCE(r.status,'') <> 'cancelled'
       AND h.status::text NOT IN ('cancelled','no_show')
       AND COALESCE(h.end_date, h.end_at::date) = v_day
  ) THEN
    RETURN v_pct;
  END IF;

  RETURN 0;
END; $$;

REVOKE EXECUTE ON FUNCTION public.grooming_checkout_discount_pct(uuid) FROM anon;

-- 2. Auto-invoice: respect a manually set discount, never invent one
CREATE OR REPLACE FUNCTION public.grooming_details_auto_invoice()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE
  v_booking public.bookings;
  v_pkg public.grooming_packages;
  v_pet_name text;
  v_inv uuid;
  v_sort integer;
  v_pkg_price numeric(12,2);
  v_disc_pct numeric(5,2);
  v_checkout_pct numeric(5,2);
  v_applied_pct numeric(5,2);
BEGIN
  SELECT * INTO v_booking FROM public.bookings WHERE id = NEW.booking_id;
  IF v_booking.id IS NULL OR v_booking.invoice_id IS NOT NULL THEN RETURN NEW; END IF;
  IF NOT COALESCE(public._auto_invoice_enabled(NEW.tenant_id, 'grooming'), true) THEN RETURN NEW; END IF;

  IF NEW.package_id IS NOT NULL THEN
    SELECT * INTO v_pkg FROM public.grooming_packages WHERE id = NEW.package_id;
  END IF;
  v_pkg_price := COALESCE(v_pkg.price_zar, 0);

  SELECT COALESCE(pensioner_discount_pct, 0) INTO v_disc_pct
  FROM public.grooming_workflow_settings WHERE tenant_id = NEW.tenant_id LIMIT 1;
  v_disc_pct := COALESCE(v_disc_pct, 0);

  -- computed (hotel-linked) discount, or an explicit staff override already on the row
  v_checkout_pct := GREATEST(
    COALESCE(public.grooming_checkout_discount_pct(v_booking.id), 0),
    COALESCE(NEW.hotel_checkout_discount_pct, 0));

  v_applied_pct := GREATEST(
    CASE WHEN COALESCE(NEW.pensioner_discount, false) THEN v_disc_pct ELSE 0 END,
    v_checkout_pct);

  IF v_checkout_pct > 0 AND COALESCE(NEW.hotel_checkout_discount_pct,0) <> v_checkout_pct THEN
    UPDATE public.grooming_booking_details
       SET hotel_checkout_discount_pct = v_checkout_pct
     WHERE id = NEW.id;
  END IF;

  SELECT p.name INTO v_pet_name
  FROM public.booking_pets bp JOIN public.pets p ON p.id = bp.pet_id
  WHERE bp.booking_id = v_booking.id LIMIT 1;

  v_inv := public.ensure_booking_invoice(v_booking.id);
  IF v_inv IS NULL THEN RETURN NEW; END IF;

  SELECT COALESCE(MAX(sort_order),0)+1 INTO v_sort FROM public.invoice_items WHERE invoice_id = v_inv;

  INSERT INTO public.invoice_items(
    tenant_id, invoice_id, booking_id, description, quantity, unit_price, sort_order, discount_pct
  ) VALUES (
    v_booking.tenant_id, v_inv, v_booking.id,
    'Grooming — ' || COALESCE(v_pkg.name, COALESCE(NEW.service_package, 'Service'))
      || CASE WHEN v_pet_name IS NOT NULL THEN ' (' || v_pet_name || ')' ELSE '' END
      || CASE WHEN v_checkout_pct > 0 AND v_checkout_pct >= v_applied_pct
              THEN ' · hotel checkout groom −' || TRIM(TO_CHAR(v_checkout_pct,'FM990.99')) || '%'
              ELSE '' END,
    1, v_pkg_price, v_sort, v_applied_pct
  );
  v_sort := v_sort + 1;

  IF COALESCE(NEW.travel_fee,0) > 0 THEN
    INSERT INTO public.invoice_items(tenant_id, invoice_id, booking_id, description, quantity, unit_price, sort_order)
    VALUES (v_booking.tenant_id, v_inv, v_booking.id, 'Mobile travel fee', 1, NEW.travel_fee, v_sort);
    v_sort := v_sort + 1;
  END IF;
  IF COALESCE(NEW.matted_surcharge_zar,0) > 0 THEN
    INSERT INTO public.invoice_items(tenant_id, invoice_id, booking_id, description, quantity, unit_price, sort_order)
    VALUES (v_booking.tenant_id, v_inv, v_booking.id, 'Matted coat surcharge', 1, NEW.matted_surcharge_zar, v_sort);
    v_sort := v_sort + 1;
  END IF;
  IF COALESCE(NEW.sedation_surcharge_zar,0) > 0 THEN
    INSERT INTO public.invoice_items(tenant_id, invoice_id, booking_id, description, quantity, unit_price, sort_order)
    VALUES (v_booking.tenant_id, v_inv, v_booking.id, 'Sedation surcharge', 1, NEW.sedation_surcharge_zar, v_sort);
  END IF;

  PERFORM public.grooming_sync_instruction_addons(v_booking.id);

  RETURN NEW;
END;
$function$;

-- 3. Link the groom to the stay BEFORE the details row triggers pricing
CREATE OR REPLACE FUNCTION public.schedule_hotel_groom(
  p_request_id uuid,
  p_start_at timestamptz,
  p_end_at timestamptz,
  p_package_id uuid DEFAULT NULL,
  p_resource_id uuid DEFAULT NULL,
  p_notes text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_r public.hotel_grooming_requests%ROWTYPE;
  v_hotel public.bookings%ROWTYPE;
  v_booking_id uuid;
  v_num text;
  v_minutes integer;
BEGIN
  SELECT * INTO v_r FROM public.hotel_grooming_requests WHERE id = p_request_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Request not found'; END IF;
  IF NOT public.user_has_tenant_access(v_r.tenant_id) THEN RAISE EXCEPTION 'Not authorised'; END IF;
  IF v_r.status = 'scheduled' THEN RAISE EXCEPTION 'Already scheduled'; END IF;
  IF v_r.pet_id IS NULL THEN RAISE EXCEPTION 'This request has no linked pet — link the pet first'; END IF;

  SELECT * INTO v_hotel FROM public.bookings WHERE id = v_r.hotel_booking_id;

  IF p_start_at::date < COALESCE(v_r.window_start, p_start_at::date)
     OR p_start_at::date > COALESCE(v_r.window_end, p_start_at::date) THEN
    RAISE EXCEPTION 'Slot must fall inside the hotel stay (% to %)', v_r.window_start, v_r.window_end;
  END IF;

  v_num := public.next_booking_number(v_r.tenant_id);

  INSERT INTO public.bookings(
    tenant_id, customer_id, booking_number, service_type, source, status,
    start_at, end_at, start_date, end_date, resource_id, notes_internal
  ) VALUES (
    v_r.tenant_id, v_r.customer_id, v_num, 'grooming_inhouse', 'staff_capture', 'confirmed',
    p_start_at, p_end_at, p_start_at::date, COALESCE(p_end_at, p_start_at)::date,
    p_resource_id,
    'Hotel guest groom — stay ' || COALESCE(v_hotel.booking_number,'')
  ) RETURNING id INTO v_booking_id;

  INSERT INTO public.booking_pets(tenant_id, booking_id, pet_id)
  VALUES (v_r.tenant_id, v_booking_id, v_r.pet_id);

  -- link first so the checkout discount can be resolved when details are inserted
  UPDATE public.hotel_grooming_requests
     SET status = 'scheduled',
         grooming_booking_id = v_booking_id,
         scheduled_at = now(),
         handled_by = public.current_profile_id(),
         updated_at = now()
   WHERE id = p_request_id;

  IF p_package_id IS NOT NULL THEN
    SELECT expected_minutes INTO v_minutes FROM public.grooming_packages WHERE id = p_package_id;
  END IF;

  INSERT INTO public.grooming_booking_details(
    tenant_id, booking_id, grooming_mode, package_id, duration_minutes, grooming_notes
  ) VALUES (
    v_r.tenant_id, v_booking_id, 'inhouse', p_package_id, v_minutes,
    NULLIF(TRIM(COALESCE(v_r.customer_notes,'') || CASE WHEN p_notes IS NOT NULL THEN E'\n' || p_notes ELSE '' END), '')
  );

  UPDATE public.bookings SET requires_grooming = true WHERE id = v_r.hotel_booking_id;

  RETURN v_booking_id;
END; $$;

REVOKE ALL ON FUNCTION public.schedule_hotel_groom(uuid, timestamptz, timestamptz, uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.schedule_hotel_groom(uuid, timestamptz, timestamptz, uuid, uuid, text) TO authenticated, service_role;

-- 4. Same ordering fix for the checkout-day groom shortcut
CREATE OR REPLACE FUNCTION public.create_checkout_groom(
  p_hotel_booking_id uuid,
  p_pet_id uuid,
  p_package_id uuid,
  p_start_time time DEFAULT '09:00'
)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_h public.bookings;
  v_pkg public.grooming_packages;
  v_day date;
  v_start timestamptz;
  v_mins integer;
  v_num text;
  v_id uuid;
BEGIN
  SELECT * INTO v_h FROM public.bookings WHERE id = p_hotel_booking_id;
  IF v_h.id IS NULL OR v_h.service_type::text NOT IN ('hotel_dog','hotel_cat') THEN
    RAISE EXCEPTION 'Hotel booking not found';
  END IF;

  IF NOT (
    EXISTS (SELECT 1 FROM public.tenant_users tu
             JOIN public.profiles pr ON pr.id = tu.profile_id
            WHERE tu.tenant_id = v_h.tenant_id AND pr.auth_user_id = auth.uid())
    OR public.current_customer_id() = v_h.customer_id
  ) THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;

  SELECT * INTO v_pkg FROM public.grooming_packages
   WHERE id = p_package_id AND tenant_id = v_h.tenant_id;
  IF v_pkg.id IS NULL THEN RAISE EXCEPTION 'Grooming package not found'; END IF;

  v_day := COALESCE(v_h.end_date, v_h.end_at::date);
  IF v_day IS NULL THEN RAISE EXCEPTION 'This stay has no checkout date yet'; END IF;

  v_mins := COALESCE(v_pkg.expected_minutes, 60);
  v_start := (v_day::text || ' ' || p_start_time::text)::timestamp AT TIME ZONE 'Africa/Johannesburg';

  v_num := public.next_booking_number(v_h.tenant_id);

  INSERT INTO public.bookings(tenant_id, customer_id, booking_number, service_type, status, source,
                              start_at, end_at, start_date, end_date, notes_internal)
  VALUES (v_h.tenant_id, v_h.customer_id, v_num, 'grooming_inhouse', 'confirmed', v_h.source,
          v_start, v_start + make_interval(mins => v_mins), v_day, v_day,
          'Checkout-day groom for hotel booking ' || COALESCE(v_h.booking_number,''))
  RETURNING id INTO v_id;

  INSERT INTO public.booking_pets(tenant_id, booking_id, pet_id)
  VALUES (v_h.tenant_id, v_id, p_pet_id);

  INSERT INTO public.hotel_grooming_requests(
    tenant_id, hotel_booking_id, pet_id, customer_id, pet_name, window_start, window_end,
    status, grooming_booking_id, scheduled_at, customer_notes)
  SELECT v_h.tenant_id, v_h.id, p_pet_id, v_h.customer_id, p.name, v_day, v_day,
         'scheduled', v_id, v_start, 'Checkout-day groom (discount applied automatically)'
    FROM public.pets p WHERE p.id = p_pet_id;

  INSERT INTO public.grooming_booking_details(tenant_id, booking_id, grooming_mode, package_id, duration_minutes)
  VALUES (v_h.tenant_id, v_id, 'in_house', v_pkg.id, v_mins);

  RETURN v_id;
END; $$;

REVOKE EXECUTE ON FUNCTION public.create_checkout_groom(uuid, uuid, uuid, time) FROM anon;
GRANT EXECUTE ON FUNCTION public.create_checkout_groom(uuid, uuid, uuid, time) TO authenticated, service_role;