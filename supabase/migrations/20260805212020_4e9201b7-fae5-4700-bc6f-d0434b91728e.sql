
-- 1. Settings + flags -------------------------------------------------
ALTER TABLE public.hotel_workflow_settings
  ADD COLUMN IF NOT EXISTS quote_validity_days integer NOT NULL DEFAULT 14;

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS deposit_waived boolean NOT NULL DEFAULT false;

-- 2. Shared hotel stay pricing ---------------------------------------
CREATE OR REPLACE FUNCTION public.hotel_stay_lines(
  p_tenant_id uuid,
  p_species text,
  p_accommodation_type text,
  p_start date,
  p_end date,
  p_pet_count integer
)
RETURNS TABLE(description text, quantity numeric, unit_price numeric, line_total numeric)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_rate public.hotel_rate_cards;
  v_nights integer;
  v_uplift numeric(6,2) := 0;
  v_peak_start text; v_peak_end text;
  v_nightly numeric(12,2);
  v_pets integer := GREATEST(1, COALESCE(p_pet_count, 1));
  v_extra integer;
BEGIN
  v_nights := GREATEST(1, COALESCE(p_end - p_start, 1));

  SELECT * INTO v_rate FROM public.hotel_rate_cards
   WHERE tenant_id = p_tenant_id
     AND species = p_species
     AND accommodation_type = COALESCE(p_accommodation_type, '')
     AND active = true
   LIMIT 1;

  IF v_rate.id IS NULL THEN
    RAISE EXCEPTION 'No active hotel rate configured for % accommodation "%". Choose an accommodation type with a rate card.',
      p_species, COALESCE(NULLIF(p_accommodation_type, ''), '(none selected)');
  END IF;
  IF COALESCE(v_rate.nightly_rate_zar, 0) <= 0 THEN
    RAISE EXCEPTION 'Hotel rate "%" has no nightly price set.', v_rate.display_name;
  END IF;

  v_nightly := v_rate.nightly_rate_zar;

  SELECT peak_start_month_day, peak_end_month_day
    INTO v_peak_start, v_peak_end
    FROM public.hotel_workflow_settings WHERE tenant_id = p_tenant_id LIMIT 1;

  IF v_peak_start IS NOT NULL AND v_peak_end IS NOT NULL AND COALESCE(v_rate.peak_uplift_pct,0) > 0 THEN
    IF EXISTS (
      SELECT 1 FROM generate_series(p_start, p_end - 1, '1 day') d
       WHERE to_char(d, 'MM-DD') BETWEEN v_peak_start AND v_peak_end
    ) THEN
      v_uplift := v_rate.peak_uplift_pct;
    END IF;
  END IF;

  IF v_uplift > 0 THEN
    v_nightly := ROUND(v_nightly * (1 + v_uplift/100), 2);
  END IF;

  description := 'Hotel stay — ' || COALESCE(v_rate.display_name, p_accommodation_type, 'boarding')
    || ' · ' || v_nights || ' night' || CASE WHEN v_nights = 1 THEN '' ELSE 's' END
    || CASE WHEN v_uplift > 0 THEN ' · peak +' || v_uplift || '%' ELSE '' END;
  quantity := v_nights;
  unit_price := v_nightly;
  line_total := ROUND(v_nightly * v_nights, 2);
  RETURN NEXT;

  v_extra := GREATEST(0, v_pets - 1);
  IF v_extra > 0 AND COALESCE(v_rate.extra_pet_rate_zar, 0) > 0 THEN
    description := 'Extra pet in same room · ' || v_nights || ' night' || CASE WHEN v_nights = 1 THEN '' ELSE 's' END;
    quantity := v_extra * v_nights;
    unit_price := v_rate.extra_pet_rate_zar;
    line_total := ROUND(v_rate.extra_pet_rate_zar * v_extra * v_nights, 2);
    RETURN NEXT;
  END IF;

  RETURN;
END; $$;

REVOKE EXECUTE ON FUNCTION public.hotel_stay_lines(uuid, text, text, date, date, integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.hotel_stay_lines(uuid, text, text, date, date, integer) TO authenticated, service_role;

-- 3. Hotel auto-invoice now uses the shared calculator ----------------
CREATE OR REPLACE FUNCTION public.hotel_details_auto_invoice()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $fn$
DECLARE
  v_booking public.bookings;
  v_species text;
  v_pet_name text;
  v_pet_count integer := 1;
  v_nights integer;
  v_inv uuid; v_sort integer;
  r record;
  v_qty numeric(6,2);
  v_price numeric(12,2);
  v_start date; v_end date;
BEGIN
  SELECT * INTO v_booking FROM public.bookings WHERE id = NEW.booking_id;
  IF v_booking.id IS NULL THEN RETURN NEW; END IF;
  IF NOT COALESCE(public._auto_invoice_enabled(NEW.tenant_id, 'hotel'), true) THEN RETURN NEW; END IF;
  IF v_booking.invoice_id IS NOT NULL AND public._invoice_locked(v_booking.invoice_id) THEN RETURN NEW; END IF;

  IF v_booking.invoice_id IS NOT NULL THEN
    DELETE FROM public.invoice_items
     WHERE booking_id = v_booking.id
       AND invoice_id = v_booking.invoice_id;
  END IF;

  v_start := COALESCE(v_booking.start_date, v_booking.start_at::date);
  v_end   := COALESCE(v_booking.end_date, v_booking.end_at::date);
  v_nights := GREATEST(1, COALESCE(v_end - v_start, 1));

  v_species := CASE WHEN v_booking.service_type::text = 'hotel_cat' THEN 'cat' ELSE 'dog' END;

  SELECT COUNT(*) INTO v_pet_count FROM public.booking_pets WHERE booking_id = v_booking.id;
  IF v_pet_count = 0 THEN v_pet_count := 1; END IF;

  SELECT p.name INTO v_pet_name
    FROM public.booking_pets bp JOIN public.pets p ON p.id = bp.pet_id
   WHERE bp.booking_id = v_booking.id
   ORDER BY p.name LIMIT 1;

  v_inv := public.ensure_booking_invoice(v_booking.id);
  IF v_inv IS NULL THEN RETURN NEW; END IF;

  SELECT COALESCE(MAX(sort_order),0)+1 INTO v_sort FROM public.invoice_items WHERE invoice_id = v_inv;

  FOR r IN
    SELECT * FROM public.hotel_stay_lines(
      NEW.tenant_id, v_species, NEW.accommodation_type, v_start, v_end, v_pet_count)
  LOOP
    INSERT INTO public.invoice_items(tenant_id, invoice_id, booking_id, description, quantity, unit_price, line_total, sort_order)
    VALUES (v_booking.tenant_id, v_inv, v_booking.id,
      CASE WHEN r.description LIKE 'Hotel stay —%' AND v_pet_name IS NOT NULL
           THEN replace(r.description, ' · ' || v_nights || ' night', ' (' || v_pet_name || ') · ' || v_nights || ' night')
           ELSE r.description END,
      r.quantity, r.unit_price, r.line_total, v_sort);
    v_sort := v_sort + 1;
  END LOOP;

  FOR r IN
    SELECT bs.quantity, COALESCE(bs.price_override_zar, s.price_zar) AS unit_price, s.name, s.per_night
    FROM public.hotel_booking_surcharges bs
    JOIN public.hotel_surcharges s ON s.id = bs.surcharge_id
    WHERE bs.booking_id = v_booking.id
  LOOP
    v_qty := r.quantity * CASE WHEN r.per_night THEN v_nights ELSE 1 END;
    v_price := r.unit_price;
    INSERT INTO public.invoice_items(tenant_id, invoice_id, booking_id, description, quantity, unit_price, line_total, sort_order)
    VALUES (v_booking.tenant_id, v_inv, v_booking.id,
      r.name || CASE WHEN r.per_night THEN ' · ' || v_nights || ' night' || CASE WHEN v_nights = 1 THEN '' ELSE 's' END ELSE '' END,
      v_qty, v_price, ROUND(v_qty * v_price, 2), v_sort);
    v_sort := v_sort + 1;
  END LOOP;

  PERFORM public.sync_hotel_deposit_invoice(v_booking.id);
  PERFORM public.sync_hotel_daycare_credits(v_booking.id);

  RETURN NEW;
END;
$fn$;

-- 4. Deposit split respects an explicit pay-in-full choice ------------
CREATE OR REPLACE FUNCTION public.sync_hotel_deposit_invoice(p_booking_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_b public.bookings;
  v_enabled boolean;
  v_pct numeric(5,2);
  v_lead integer;
  v_gross numeric(12,2);
  v_dep numeric(12,2);
  v_dep_inv uuid;
  v_num text;
  v_sort integer;
  v_checkin date;
BEGIN
  SELECT * INTO v_b FROM public.bookings WHERE id = p_booking_id;
  IF v_b.id IS NULL OR v_b.invoice_id IS NULL THEN RETURN; END IF;
  IF v_b.service_type::text NOT IN ('hotel_dog','hotel_cat') THEN RETURN; END IF;
  IF COALESCE(v_b.deposit_waived, false) THEN RETURN; END IF;
  IF public._invoice_locked(v_b.invoice_id) THEN RETURN; END IF;

  SELECT COALESCE(deposit_split_enabled, true) INTO v_enabled
    FROM public.hotel_workflow_settings WHERE tenant_id = v_b.tenant_id LIMIT 1;
  IF NOT COALESCE(v_enabled, true) THEN RETURN; END IF;

  SELECT COALESCE(hotel_deposit_percent, 50), COALESCE(hotel_balance_due_days_before, 7)
    INTO v_pct, v_lead
    FROM public.policy_settings WHERE tenant_id = v_b.tenant_id LIMIT 1;
  v_pct  := COALESCE(v_pct, 50);
  v_lead := COALESCE(v_lead, 7);
  IF v_pct <= 0 OR v_pct >= 100 THEN RETURN; END IF;

  DELETE FROM public.invoice_items
   WHERE invoice_id = v_b.invoice_id AND source_type = 'hotel_deposit_offset';

  SELECT COALESCE(SUM(line_total),0) INTO v_gross
    FROM public.invoice_items WHERE invoice_id = v_b.invoice_id;
  IF v_gross <= 0 THEN RETURN; END IF;

  v_dep := ROUND(v_gross * v_pct / 100, 2);
  v_dep_inv := v_b.deposit_invoice_id;
  v_checkin := COALESCE(v_b.start_date, v_b.start_at::date);

  IF v_dep_inv IS NULL THEN
    v_num := public.next_invoice_number(v_b.tenant_id);
    INSERT INTO public.invoices(tenant_id, customer_id, booking_id, invoice_number, invoice_kind,
                                status, notes, issue_date, due_date)
    VALUES (v_b.tenant_id, v_b.customer_id, v_b.id, v_num, 'deposit', 'issued',
            'Deposit — booking ' || COALESCE(v_b.booking_number,''), CURRENT_DATE, CURRENT_DATE)
    RETURNING id INTO v_dep_inv;
    UPDATE public.bookings SET deposit_invoice_id = v_dep_inv WHERE id = v_b.id;
  END IF;

  IF NOT public._invoice_locked(v_dep_inv) THEN
    DELETE FROM public.invoice_items WHERE invoice_id = v_dep_inv AND source_type = 'hotel_deposit';
    INSERT INTO public.invoice_items(tenant_id, invoice_id, booking_id, description,
                                     quantity, unit_price, line_total, sort_order, source_type, source_id)
    VALUES (v_b.tenant_id, v_dep_inv, v_b.id,
            'Deposit (' || TRIM(TO_CHAR(v_pct,'FM990.99')) || '%) to secure booking '
              || COALESCE(v_b.booking_number,''),
            1, v_dep, v_dep, 1, 'hotel_deposit', v_b.id);
  END IF;

  SELECT COALESCE(MAX(sort_order),0)+1 INTO v_sort
    FROM public.invoice_items WHERE invoice_id = v_b.invoice_id;

  INSERT INTO public.invoice_items(tenant_id, invoice_id, booking_id, description,
                                   quantity, unit_price, line_total, sort_order, source_type, source_id)
  VALUES (v_b.tenant_id, v_b.invoice_id, v_b.id,
          'Less deposit already invoiced', 1, -v_dep, -v_dep, v_sort, 'hotel_deposit_offset', v_b.id);

  UPDATE public.invoices
     SET invoice_kind = 'balance',
         due_date = GREATEST(CURRENT_DATE, COALESCE(v_checkin, CURRENT_DATE) - v_lead),
         booking_id = COALESCE(booking_id, v_b.id),
         updated_at = now()
   WHERE id = v_b.invoice_id;
END; $$;

REVOKE EXECUTE ON FUNCTION public.sync_hotel_deposit_invoice(uuid) FROM anon;

-- 5. Pay in full: collapse deposit + balance into one invoice ---------
CREATE OR REPLACE FUNCTION public.hotel_pay_in_full(p_booking_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_b public.bookings;
  v_paid numeric(12,2);
BEGIN
  SELECT * INTO v_b FROM public.bookings WHERE id = p_booking_id;
  IF v_b.id IS NULL THEN RAISE EXCEPTION 'Booking not found'; END IF;

  IF NOT (
    EXISTS (SELECT 1 FROM public.tenant_users tu
             JOIN public.profiles pr ON pr.id = tu.profile_id
            WHERE tu.tenant_id = v_b.tenant_id AND pr.auth_user_id = auth.uid())
    OR public.current_customer_id() = v_b.customer_id
  ) THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;

  IF v_b.deposit_invoice_id IS NOT NULL THEN
    SELECT COALESCE(SUM(amount),0) INTO v_paid
      FROM public.payment_allocations WHERE invoice_id = v_b.deposit_invoice_id;
    IF COALESCE(v_paid,0) > 0 THEN
      RAISE EXCEPTION 'The deposit invoice already has a payment against it.';
    END IF;

    DELETE FROM public.invoice_items WHERE invoice_id = v_b.deposit_invoice_id;
    UPDATE public.invoices
       SET status = 'cancelled',
           notes = COALESCE(notes,'') || ' — cancelled: customer chose to pay in full',
           updated_at = now()
     WHERE id = v_b.deposit_invoice_id;
  END IF;

  IF v_b.invoice_id IS NOT NULL THEN
    DELETE FROM public.invoice_items
     WHERE invoice_id = v_b.invoice_id AND source_type = 'hotel_deposit_offset';
    UPDATE public.invoices
       SET invoice_kind = 'standard', due_date = CURRENT_DATE, updated_at = now()
     WHERE id = v_b.invoice_id;
  END IF;

  UPDATE public.bookings
     SET deposit_waived = true, deposit_invoice_id = NULL, updated_at = now()
   WHERE id = v_b.id;

  RETURN v_b.invoice_id;
END; $$;

REVOKE EXECUTE ON FUNCTION public.hotel_pay_in_full(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.hotel_pay_in_full(uuid) TO authenticated, service_role;

-- 6. Checkout-day groom at the hotel discount -------------------------
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

  INSERT INTO public.grooming_booking_details(tenant_id, booking_id, grooming_mode, package_id, duration_minutes)
  VALUES (v_h.tenant_id, v_id, 'in_house', v_pkg.id, v_mins);

  INSERT INTO public.hotel_grooming_requests(
    tenant_id, hotel_booking_id, pet_id, customer_id, pet_name, window_start, window_end,
    status, grooming_booking_id, scheduled_at, customer_notes)
  SELECT v_h.tenant_id, v_h.id, p_pet_id, v_h.customer_id, p.name, v_day, v_day,
         'scheduled', v_id, v_start, 'Checkout-day groom (discount applied automatically)'
    FROM public.pets p WHERE p.id = p_pet_id;

  RETURN v_id;
END; $$;

REVOKE EXECUTE ON FUNCTION public.create_checkout_groom(uuid, uuid, uuid, time) FROM anon;
GRANT EXECUTE ON FUNCTION public.create_checkout_groom(uuid, uuid, uuid, time) TO authenticated, service_role;
