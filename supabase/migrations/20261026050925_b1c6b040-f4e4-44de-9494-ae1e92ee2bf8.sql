CREATE OR REPLACE FUNCTION public.ensure_booking_invoice_before_hotel_review(p_booking_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_b public.bookings;
  v_id uuid;
  v_terms integer;
  v_num text;
  v_issue date;
  v_due date;
BEGIN
  SELECT * INTO v_b FROM public.bookings WHERE id = p_booking_id;
  IF v_b.id IS NULL THEN RETURN NULL; END IF;
  IF v_b.invoice_id IS NOT NULL THEN RETURN v_b.invoice_id; END IF;

  -- Multi-pet groups share a single invoice for the owner.
  IF v_b.booking_group_id IS NOT NULL THEN
    SELECT s.invoice_id INTO v_id
    FROM public.bookings s
    JOIN public.invoices i ON i.id = s.invoice_id
    WHERE s.booking_group_id = v_b.booking_group_id
      AND s.tenant_id = v_b.tenant_id
      AND s.customer_id = v_b.customer_id
      AND s.invoice_id IS NOT NULL
      AND i.status::text NOT IN ('cancelled', 'paid')
    ORDER BY s.created_at
    LIMIT 1;

    IF v_id IS NOT NULL THEN
      UPDATE public.bookings SET invoice_id = v_id WHERE id = p_booking_id;
      RETURN v_id;
    END IF;
  END IF;

  SELECT COALESCE(payment_terms_days, 14) INTO v_terms
  FROM public.invoicing_settings WHERE tenant_id = v_b.tenant_id;
  v_terms := COALESCE(v_terms, 14);

  -- Bookings made in advance are dated and payable on the service date, so a
  -- batch of repeat appointments doesn't produce a stack of invoices all
  -- dated the day they were captured. Same-day/past bookings keep the
  -- standard payment terms.
  IF v_b.start_at IS NOT NULL AND v_b.start_at::date > CURRENT_DATE THEN
    v_issue := v_b.start_at::date;
    v_due := v_b.start_at::date;
  ELSE
    v_issue := CURRENT_DATE;
    v_due := CURRENT_DATE + v_terms;
  END IF;

  v_num := public.next_invoice_number(v_b.tenant_id);

  INSERT INTO public.invoices(
    tenant_id, customer_id, invoice_number, status, notes, issue_date, due_date
  ) VALUES (
    v_b.tenant_id, v_b.customer_id, v_num, 'issued',
    'Booking ' || COALESCE(v_b.booking_number, ''),
    v_issue, v_due
  ) RETURNING id INTO v_id;

  UPDATE public.bookings SET invoice_id = v_id WHERE id = p_booking_id;
  RETURN v_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.grooming_details_auto_invoice()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
      || CASE WHEN v_booking.start_at IS NOT NULL THEN ' · ' || TO_CHAR(v_booking.start_at, 'DD Mon YYYY') ELSE '' END
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