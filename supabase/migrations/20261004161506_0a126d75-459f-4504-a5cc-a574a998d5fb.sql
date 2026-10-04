ALTER TABLE public.grooming_workflow_settings
  ADD COLUMN IF NOT EXISTS puppy_discount_pct numeric(5,2) NOT NULL DEFAULT 50,
  ADD COLUMN IF NOT EXISTS daycare_enrolled_discount_pct numeric(5,2) NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION public.grooming_auto_discount(p_booking_id uuid)
RETURNS TABLE(puppy_pct numeric, daycare_pct numeric)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_b public.bookings;
  v_day date;
  v_pet uuid;
  v_dob date;
  v_s public.grooming_workflow_settings;
BEGIN
  puppy_pct := 0; daycare_pct := 0;
  SELECT * INTO v_b FROM public.bookings WHERE id = p_booking_id;
  IF v_b.id IS NULL THEN RETURN NEXT; RETURN; END IF;
  v_day := COALESCE((v_b.start_at AT TIME ZONE 'Africa/Johannesburg')::date, current_date);
  SELECT * INTO v_s FROM public.grooming_workflow_settings WHERE tenant_id = v_b.tenant_id LIMIT 1;
  SELECT bp.pet_id, p.date_of_birth INTO v_pet, v_dob
  FROM public.booking_pets bp JOIN public.pets p ON p.id = bp.pet_id
  WHERE bp.booking_id = p_booking_id LIMIT 1;
  IF v_pet IS NULL THEN RETURN NEXT; RETURN; END IF;

  IF v_dob IS NOT NULL AND COALESCE(v_s.puppy_discount_pct, 50) > 0
     AND v_day < (v_dob + make_interval(months => COALESCE(v_s.puppy_half_price_max_months, 6)))::date THEN
    puppy_pct := COALESCE(v_s.puppy_discount_pct, 50);
  END IF;

  IF COALESCE(v_s.daycare_enrolled_discount_pct, 0) > 0 AND EXISTS (
    SELECT 1 FROM public.daycare_enrolments e
    WHERE e.pet_id = v_pet AND e.active
      AND e.start_date <= v_day AND (e.end_date IS NULL OR e.end_date >= v_day)
      AND NOT (e.paused_from IS NOT NULL AND v_day BETWEEN e.paused_from AND COALESCE(e.paused_to, v_day))
  ) THEN
    daycare_pct := v_s.daycare_enrolled_discount_pct;
  END IF;
  RETURN NEXT;
END;
$$;
REVOKE ALL ON FUNCTION public.grooming_auto_discount(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.grooming_auto_discount(uuid) TO authenticated, service_role;

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
  v_pens_pct numeric(5,2);
  v_puppy_pct numeric(5,2) := 0;
  v_daycare_pct numeric(5,2) := 0;
  v_applied_pct numeric(5,2);
  v_label text := '';
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

  v_checkout_pct := GREATEST(
    COALESCE(public.grooming_checkout_discount_pct(v_booking.id), 0),
    COALESCE(NEW.hotel_checkout_discount_pct, 0));
  v_pens_pct := CASE WHEN COALESCE(NEW.pensioner_discount, false) THEN v_disc_pct ELSE 0 END;
  SELECT COALESCE(a.puppy_pct,0), COALESCE(a.daycare_pct,0) INTO v_puppy_pct, v_daycare_pct
  FROM public.grooming_auto_discount(v_booking.id) a;

  v_applied_pct := GREATEST(v_pens_pct, v_checkout_pct, v_puppy_pct, v_daycare_pct);

  IF v_applied_pct > 0 THEN
    v_label := CASE
      WHEN v_applied_pct = v_checkout_pct THEN ' · hotel checkout groom −'
      WHEN v_applied_pct = v_puppy_pct THEN ' · puppy discount −'
      WHEN v_applied_pct = v_daycare_pct THEN ' · daycare member discount −'
      ELSE ' · pensioner discount −' END
      || TRIM(TO_CHAR(v_applied_pct,'FM990.99')) || '%';
  END IF;

  IF v_checkout_pct > 0 AND COALESCE(NEW.hotel_checkout_discount_pct,0) <> v_checkout_pct THEN
    UPDATE public.grooming_booking_details SET hotel_checkout_discount_pct = v_checkout_pct WHERE id = NEW.id;
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
      || v_label,
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