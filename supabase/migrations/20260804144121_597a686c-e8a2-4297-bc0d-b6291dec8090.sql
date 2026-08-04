-- 1. Hotel auto-invoice: also sync deposit split + daycare credits
CREATE OR REPLACE FUNCTION public.hotel_details_auto_invoice()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE
  v_booking public.bookings;
  v_species text;
  v_pet_name text;
  v_pet_count integer := 1;
  v_nights integer;
  v_inv uuid; v_sort integer;
  v_rate public.hotel_rate_cards;
  v_uplift numeric(6,2) := 0;
  v_peak_start text; v_peak_end text;
  v_nightly numeric(12,2);
  v_line_total numeric(12,2);
  v_pets_over_first integer;
  r record;
  v_qty numeric(6,2);
  v_price numeric(12,2);
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

  v_nights := GREATEST(1, COALESCE(
    (v_booking.end_date - v_booking.start_date),
    (EXTRACT(EPOCH FROM (v_booking.end_at - v_booking.start_at))/86400)::int,
    1));

  v_species := CASE WHEN v_booking.service_type::text = 'hotel_cat' THEN 'cat' ELSE 'dog' END;

  SELECT * INTO v_rate FROM public.hotel_rate_cards
   WHERE tenant_id = NEW.tenant_id
     AND species = v_species
     AND accommodation_type = COALESCE(NEW.accommodation_type, '')
     AND active = true
   LIMIT 1;

  v_nightly := COALESCE(v_rate.nightly_rate_zar, 0);

  SELECT peak_start_month_day, peak_end_month_day
    INTO v_peak_start, v_peak_end
  FROM public.hotel_workflow_settings WHERE tenant_id = NEW.tenant_id LIMIT 1;

  IF v_peak_start IS NOT NULL AND v_peak_end IS NOT NULL AND COALESCE(v_rate.peak_uplift_pct,0) > 0 THEN
    IF EXISTS (
      SELECT 1 FROM generate_series(
        COALESCE(v_booking.start_date, v_booking.start_at::date),
        COALESCE(v_booking.end_date, v_booking.end_at::date) - 1,
        '1 day') d
      WHERE to_char(d, 'MM-DD') BETWEEN v_peak_start AND v_peak_end
    ) THEN
      v_uplift := v_rate.peak_uplift_pct;
    END IF;
  END IF;

  IF v_uplift > 0 THEN
    v_nightly := ROUND(v_nightly * (1 + v_uplift/100), 2);
  END IF;

  SELECT COUNT(*) INTO v_pet_count FROM public.booking_pets WHERE booking_id = v_booking.id;
  IF v_pet_count = 0 THEN v_pet_count := 1; END IF;

  SELECT p.name INTO v_pet_name
    FROM public.booking_pets bp JOIN public.pets p ON p.id = bp.pet_id
   WHERE bp.booking_id = v_booking.id
   ORDER BY p.name LIMIT 1;

  v_inv := public.ensure_booking_invoice(v_booking.id);
  IF v_inv IS NULL THEN RETURN NEW; END IF;

  SELECT COALESCE(MAX(sort_order),0)+1 INTO v_sort FROM public.invoice_items WHERE invoice_id = v_inv;

  v_line_total := ROUND(v_nightly * v_nights, 2);
  INSERT INTO public.invoice_items(tenant_id, invoice_id, booking_id, description, quantity, unit_price, line_total, sort_order)
  VALUES (v_booking.tenant_id, v_inv, v_booking.id,
    'Hotel stay — ' || COALESCE(v_rate.display_name, NEW.accommodation_type, 'boarding')
      || CASE WHEN v_pet_name IS NOT NULL THEN ' (' || v_pet_name || ')' ELSE '' END
      || ' · ' || v_nights || ' night' || CASE WHEN v_nights = 1 THEN '' ELSE 's' END
      || CASE WHEN v_uplift > 0 THEN ' · peak +' || v_uplift || '%' ELSE '' END,
    v_nights, v_nightly, v_line_total, v_sort);
  v_sort := v_sort + 1;

  v_pets_over_first := GREATEST(0, v_pet_count - 1);
  IF v_pets_over_first > 0 AND COALESCE(v_rate.extra_pet_rate_zar, 0) > 0 THEN
    INSERT INTO public.invoice_items(tenant_id, invoice_id, booking_id, description, quantity, unit_price, line_total, sort_order)
    VALUES (v_booking.tenant_id, v_inv, v_booking.id,
      'Extra pet in same room · ' || v_nights || ' night' || CASE WHEN v_nights = 1 THEN '' ELSE 's' END,
      v_pets_over_first * v_nights,
      v_rate.extra_pet_rate_zar,
      ROUND(v_rate.extra_pet_rate_zar * v_pets_over_first * v_nights, 2),
      v_sort);
    v_sort := v_sort + 1;
  END IF;

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
$function$;

-- 2. Grooming auto-invoice: apply checkout-day hotel discount automatically
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

  v_checkout_pct := COALESCE(public.grooming_checkout_discount_pct(v_booking.id), 0);
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

-- 3. Cancelling / restoring a hotel booking resyncs its daycare credits
CREATE OR REPLACE FUNCTION public.hotel_booking_status_credit_sync()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NEW.service_type::text IN ('hotel_dog','hotel_cat')
     AND NEW.status IS DISTINCT FROM OLD.status THEN
    PERFORM public.sync_hotel_daycare_credits(NEW.id);
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_hotel_booking_status_credit_sync ON public.bookings;
CREATE TRIGGER trg_hotel_booking_status_credit_sync
  AFTER UPDATE OF status ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.hotel_booking_status_credit_sync();

-- 4. Monthly daycare run applies pending hotel credits
CREATE OR REPLACE FUNCTION public.generate_monthly_daycare_invoices(
  p_tenant_id uuid, p_period_start date, p_preview boolean DEFAULT false, p_issue boolean DEFAULT true)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE
  v_pe date;
  v_period_label text;
  v_created_invoices int := 0;
  v_added_lines int := 0;
  v_before_invoices int;
  r record;
  v_inv uuid;
  v_price numeric(12,2);
  v_desc text;
  v_next_sort integer;
  v_total numeric(12,2) := 0;
  v_customers int := 0;
  v_issued int := 0;
  v_due_day smallint;
  v_due date;
  v_ids uuid[] := '{}';
  v_credit_total numeric(12,2) := 0;
  v_credit_lines int := 0;
BEGIN
  IF NOT public.user_has_permission(p_tenant_id, 'invoicing.run_monthly') AND NOT public.is_platform_owner() THEN
    RAISE EXCEPTION 'Missing permission invoicing.run_monthly';
  END IF;

  v_pe := (date_trunc('month', p_period_start) + INTERVAL '1 month - 1 day')::date;
  v_period_label := to_char(p_period_start, 'Mon YYYY');

  IF p_preview THEN
    SELECT COUNT(DISTINCT e.customer_id), COUNT(*), COALESCE(SUM(COALESCE(dp.price,0)),0)
      INTO v_customers, v_added_lines, v_total
    FROM public.daycare_enrolments e
    LEFT JOIN public.daycare_plans dp ON dp.id = e.daycare_plan_id
    WHERE e.tenant_id = p_tenant_id
      AND COALESCE(e.active, true)
      AND COALESCE(e.start_date, p_period_start) <= v_pe
      AND (e.end_date IS NULL OR e.end_date >= p_period_start)
      AND NOT (e.paused_from IS NOT NULL AND e.paused_from <= p_period_start
               AND COALESCE(e.paused_to, DATE '9999-12-31') >= v_pe)
      AND NOT EXISTS (
        SELECT 1 FROM public.invoice_items ii
        JOIN public.invoices inv ON inv.id = ii.invoice_id
        WHERE ii.source_type = 'daycare_enrolment_prorata' AND ii.source_id = e.id
          AND inv.billing_period_end BETWEEN p_period_start AND v_pe
      );

    SELECT COUNT(*), COALESCE(SUM(amount_zar),0) INTO v_credit_lines, v_credit_total
      FROM public.hotel_daycare_credits
     WHERE tenant_id = p_tenant_id AND status = 'pending';

    RETURN jsonb_build_object(
      'preview', true, 'customers', v_customers, 'lines', v_added_lines,
      'total', v_total - v_credit_total,
      'gross_total', v_total,
      'hotel_credit_lines', v_credit_lines,
      'hotel_credit_total', v_credit_total,
      'period_start', p_period_start, 'period_end', v_pe,
      'period_label', v_period_label);
  END IF;

  SELECT COALESCE(billing_due_day, 1) INTO v_due_day
  FROM public.invoicing_settings WHERE tenant_id = p_tenant_id;
  v_due := (date_trunc('month', p_period_start) + ((COALESCE(v_due_day,1) - 1) || ' days')::interval)::date;

  FOR r IN
    SELECT e.id AS enrolment_id, e.tenant_id, e.customer_id, e.pet_id,
           e.daycare_plan_id, dp.name AS plan_name, dp.price AS plan_price,
           pt.name AS pet_name
    FROM public.daycare_enrolments e
    LEFT JOIN public.daycare_plans dp ON dp.id = e.daycare_plan_id
    LEFT JOIN public.pets pt ON pt.id = e.pet_id
    WHERE e.tenant_id = p_tenant_id
      AND COALESCE(e.active, true)
      AND COALESCE(e.start_date, p_period_start) <= v_pe
      AND (e.end_date IS NULL OR e.end_date >= p_period_start)
      AND NOT (e.paused_from IS NOT NULL AND e.paused_from <= p_period_start
               AND COALESCE(e.paused_to, DATE '9999-12-31') >= v_pe)
      AND NOT EXISTS (
        SELECT 1 FROM public.invoice_items ii
        JOIN public.invoices inv ON inv.id = ii.invoice_id
        WHERE ii.source_type = 'daycare_enrolment_prorata' AND ii.source_id = e.id
          AND inv.billing_period_end BETWEEN p_period_start AND v_pe
      )
  LOOP
    v_price := COALESCE(r.plan_price, 0);
    v_desc := 'Daycare — ' || COALESCE(r.plan_name, 'Drop-in')
              || CASE WHEN r.pet_name IS NOT NULL THEN ' (' || r.pet_name || ')' ELSE '' END
              || ' — ' || v_period_label;

    SELECT count(*) INTO v_before_invoices FROM public.invoices
      WHERE tenant_id = p_tenant_id AND customer_id = r.customer_id
        AND status = 'draft' AND billing_period_start = p_period_start;

    v_inv := public.ensure_draft_invoice(p_tenant_id, r.customer_id, p_period_start, v_pe, 'Daycare — ' || v_period_label);
    IF v_before_invoices = 0 THEN v_created_invoices := v_created_invoices + 1; END IF;
    IF NOT (v_inv = ANY(v_ids)) THEN v_ids := array_append(v_ids, v_inv); END IF;

    SELECT COALESCE(MAX(sort_order),0)+1 INTO v_next_sort FROM public.invoice_items WHERE invoice_id = v_inv;

    BEGIN
      INSERT INTO public.invoice_items(tenant_id, invoice_id, description, quantity, unit_price, line_total, sort_order, source_type, source_id)
      VALUES (p_tenant_id, v_inv, v_desc, 1, v_price, ROUND(v_price,2), v_next_sort, 'daycare_enrolment', r.enrolment_id);
      v_added_lines := v_added_lines + 1;
    EXCEPTION WHEN unique_violation THEN
      NULL;
    END;

    UPDATE public.invoices i SET
      subtotal = (SELECT COALESCE(SUM(line_total),0) FROM public.invoice_items WHERE invoice_id = i.id),
      total    = (SELECT COALESCE(SUM(line_total),0) FROM public.invoice_items WHERE invoice_id = i.id),
      balance_due = (SELECT COALESCE(SUM(line_total),0) FROM public.invoice_items WHERE invoice_id = i.id) - i.amount_paid,
      updated_at = now()
    WHERE i.id = v_inv;
  END LOOP;

  -- hotel-stay credits for daycare customers
  FOR r IN
    SELECT c.id AS credit_id, c.customer_id, c.amount_zar, c.nights, c.daily_rate_zar,
           p.name AS pet_name, b.booking_number
      FROM public.hotel_daycare_credits c
      LEFT JOIN public.pets p ON p.id = c.pet_id
      LEFT JOIN public.bookings b ON b.id = c.booking_id
     WHERE c.tenant_id = p_tenant_id AND c.status = 'pending' AND c.amount_zar > 0
  LOOP
    v_inv := public.ensure_draft_invoice(p_tenant_id, r.customer_id, p_period_start, v_pe, 'Daycare — ' || v_period_label);
    IF NOT (v_inv = ANY(v_ids)) THEN v_ids := array_append(v_ids, v_inv); END IF;

    SELECT COALESCE(MAX(sort_order),0)+1 INTO v_next_sort FROM public.invoice_items WHERE invoice_id = v_inv;

    INSERT INTO public.invoice_items(tenant_id, invoice_id, description, quantity, unit_price, line_total, sort_order, source_type, source_id)
    VALUES (p_tenant_id, v_inv,
      'Credit — hotel stay ' || COALESCE(r.booking_number,'')
        || CASE WHEN r.pet_name IS NOT NULL THEN ' (' || r.pet_name || ')' ELSE '' END
        || ' · ' || r.nights || ' day' || CASE WHEN r.nights = 1 THEN '' ELSE 's' END || ' daycare not used',
      1, -r.amount_zar, -r.amount_zar, v_next_sort, 'hotel_daycare_credit', r.credit_id);

    UPDATE public.hotel_daycare_credits
       SET status = 'applied', applied_invoice_id = v_inv, updated_at = now()
     WHERE id = r.credit_id;

    v_credit_lines := v_credit_lines + 1;
    v_credit_total := v_credit_total + r.amount_zar;

    UPDATE public.invoices i SET
      subtotal = (SELECT COALESCE(SUM(line_total),0) FROM public.invoice_items WHERE invoice_id = i.id),
      total    = (SELECT COALESCE(SUM(line_total),0) FROM public.invoice_items WHERE invoice_id = i.id),
      balance_due = (SELECT COALESCE(SUM(line_total),0) FROM public.invoice_items WHERE invoice_id = i.id) - i.amount_paid,
      updated_at = now()
    WHERE i.id = v_inv;
  END LOOP;

  IF p_issue THEN
    UPDATE public.invoices
       SET status = 'issued',
           issue_date = COALESCE(issue_date, CURRENT_DATE),
           due_date = COALESCE(due_date, v_due),
           updated_at = now()
     WHERE id = ANY(v_ids) AND status = 'draft';
    GET DIAGNOSTICS v_issued = ROW_COUNT;
  END IF;

  RETURN jsonb_build_object(
    'preview', false,
    'invoices', v_created_invoices,
    'lines', v_added_lines,
    'hotel_credit_lines', v_credit_lines,
    'hotel_credit_total', v_credit_total,
    'issued', v_issued,
    'invoice_ids', to_jsonb(v_ids),
    'period_start', p_period_start,
    'period_end', v_pe,
    'period_label', v_period_label);
END;
$function$;

-- 5. Accept a quote -> create the hotel booking
CREATE OR REPLACE FUNCTION public.accept_estimate(p_estimate_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_e public.estimates;
  v_booking uuid;
  v_num text;
  v_pet uuid;
BEGIN
  SELECT * INTO v_e FROM public.estimates WHERE id = p_estimate_id;
  IF v_e.id IS NULL THEN RAISE EXCEPTION 'Quote not found'; END IF;
  IF NOT public.user_has_tenant_access(v_e.tenant_id) THEN
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

  INSERT INTO public.hotel_booking_details(tenant_id, booking_id, accommodation_type)
  VALUES (v_e.tenant_id, v_booking, v_e.accommodation_type);

  UPDATE public.estimates
     SET status = 'accepted', accepted_at = now(), booking_id = v_booking, updated_at = now()
   WHERE id = p_estimate_id;

  RETURN v_booking;
END; $$;

REVOKE EXECUTE ON FUNCTION public.accept_estimate(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.hotel_booking_status_credit_sync() FROM anon, authenticated;
