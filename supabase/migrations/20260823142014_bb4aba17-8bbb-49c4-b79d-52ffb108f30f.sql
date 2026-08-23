CREATE OR REPLACE FUNCTION public.create_checkout_groom(p_hotel_booking_id uuid, p_pet_id uuid, p_package_id uuid, p_start_time time without time zone DEFAULT '09:00:00'::time without time zone)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  VALUES (v_h.tenant_id, v_id, 'inhouse', v_pkg.id, v_mins);

  RETURN v_id;
END; $function$;