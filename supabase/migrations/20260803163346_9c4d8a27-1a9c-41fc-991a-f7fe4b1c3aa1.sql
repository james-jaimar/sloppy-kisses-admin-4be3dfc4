-- 1. Helper: is an invoice locked (sent/paid/etc.)?
CREATE OR REPLACE FUNCTION public._invoice_locked(p_invoice_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE((SELECT status::text IN ('sent','part_paid','paid','overdue','cancelled')
                   FROM public.invoices WHERE id = p_invoice_id), false);
$$;

REVOKE ALL ON FUNCTION public._invoice_locked(uuid) FROM PUBLIC, anon, authenticated;

-- 2. Helper: per-booking issued invoice
CREATE OR REPLACE FUNCTION public.ensure_booking_invoice(p_booking_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_b public.bookings;
  v_id uuid;
  v_terms integer;
  v_num text;
BEGIN
  SELECT * INTO v_b FROM public.bookings WHERE id = p_booking_id;
  IF v_b.id IS NULL THEN RETURN NULL; END IF;
  IF v_b.invoice_id IS NOT NULL THEN RETURN v_b.invoice_id; END IF;

  SELECT COALESCE(payment_terms_days, 14) INTO v_terms
  FROM public.invoicing_settings WHERE tenant_id = v_b.tenant_id;
  v_terms := COALESCE(v_terms, 14);

  v_num := public.next_invoice_number(v_b.tenant_id);

  INSERT INTO public.invoices(
    tenant_id, customer_id, invoice_number, status, notes, issue_date, due_date
  ) VALUES (
    v_b.tenant_id, v_b.customer_id, v_num, 'issued',
    'Booking ' || COALESCE(v_b.booking_number, ''),
    CURRENT_DATE, CURRENT_DATE + v_terms
  ) RETURNING id INTO v_id;

  UPDATE public.bookings SET invoice_id = v_id WHERE id = p_booking_id;
  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_booking_invoice(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ensure_booking_invoice(uuid) TO authenticated, service_role;

-- 3. Grooming: own issued invoice per booking
CREATE OR REPLACE FUNCTION public.grooming_details_auto_invoice()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_booking public.bookings;
  v_pkg public.grooming_packages;
  v_pet_name text;
  v_inv uuid;
  v_sort integer;
  v_pkg_price numeric(12,2);
  v_disc_pct numeric(5,2);
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
      || CASE WHEN v_pet_name IS NOT NULL THEN ' (' || v_pet_name || ')' ELSE '' END,
    1, v_pkg_price, v_sort,
    CASE WHEN COALESCE(NEW.pensioner_discount, false) THEN v_disc_pct ELSE 0 END
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
$$;

-- 4. Grooming add-ons: skip locked invoices
CREATE OR REPLACE FUNCTION public.grooming_addons_auto_invoice()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_booking public.bookings;
  v_addon_name text;
  v_price numeric(12,2);
  v_sort integer;
BEGIN
  SELECT * INTO v_booking FROM public.bookings WHERE id = NEW.booking_id;
  IF v_booking.id IS NULL OR v_booking.invoice_id IS NULL THEN RETURN NEW; END IF;
  IF NOT COALESCE(public._auto_invoice_enabled(NEW.tenant_id, 'grooming'), true) THEN RETURN NEW; END IF;
  IF public._invoice_locked(v_booking.invoice_id) THEN RETURN NEW; END IF;

  SELECT name, price_zar INTO v_addon_name, v_price
  FROM public.grooming_addons WHERE id = NEW.addon_id;
  v_price := COALESCE(NEW.price_zar_snapshot, v_price, 0);

  SELECT COALESCE(MAX(sort_order),0)+1 INTO v_sort FROM public.invoice_items WHERE invoice_id = v_booking.invoice_id;

  INSERT INTO public.invoice_items(tenant_id, invoice_id, booking_id, description, quantity, unit_price, line_total, sort_order)
  VALUES (v_booking.tenant_id, v_booking.invoice_id, v_booking.id,
    'Add-on — ' || COALESCE(v_addon_name, 'Grooming add-on'),
    COALESCE(NEW.quantity, 1), v_price, ROUND(COALESCE(NEW.quantity,1) * v_price, 2), v_sort);

  UPDATE public.invoices i SET
    subtotal = (SELECT COALESCE(SUM(line_total),0) FROM public.invoice_items WHERE invoice_id = i.id),
    total    = (SELECT COALESCE(SUM(line_total),0) FROM public.invoice_items WHERE invoice_id = i.id),
    balance_due = (SELECT COALESCE(SUM(line_total),0) FROM public.invoice_items WHERE invoice_id = i.id) - i.amount_paid,
    updated_at = now()
  WHERE i.id = v_booking.invoice_id;

  RETURN NEW;
END;
$$;

-- 5. Hotel: own issued invoice per booking
CREATE OR REPLACE FUNCTION public.hotel_details_auto_invoice()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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

  RETURN NEW;
END;
$$;

-- 6. Transport: own issued invoice per booking
CREATE OR REPLACE FUNCTION public.transport_details_auto_invoice()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_booking public.bookings; v_inv uuid; v_sort integer;
  v_settings public.transport_workflow_settings;
  v_base numeric(12,2) := 0;
  v_mult numeric(6,3) := 1;
  v_price numeric(12,2) := 0;
  v_suburb text;
  v_pet_name text;
BEGIN
  SELECT * INTO v_booking FROM public.bookings WHERE id = NEW.booking_id;
  IF v_booking.id IS NULL THEN RETURN NEW; END IF;
  IF v_booking.invoice_id IS NOT NULL AND public._invoice_locked(v_booking.invoice_id) THEN RETURN NEW; END IF;

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

  v_inv := public.ensure_booking_invoice(v_booking.id);
  IF v_inv IS NULL THEN RETURN NEW; END IF;

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
$$;

-- 7. Daycare: no invoice on enrolment
DROP TRIGGER IF EXISTS trg_daycare_enrolments_auto_invoice ON public.daycare_enrolments;
DROP FUNCTION IF EXISTS public.daycare_enrolments_auto_invoice();

-- 8. Monthly daycare run: preview + issue
CREATE OR REPLACE FUNCTION public.generate_monthly_daycare_invoices(
  p_tenant_id uuid,
  p_period_start date,
  p_preview boolean DEFAULT false,
  p_issue boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
  v_run_id uuid;
  v_ids uuid[] := '{}';
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
      AND COALESCE(e.status::text, 'active') = 'active'
      AND COALESCE(e.start_date, p_period_start) <= v_pe
      AND (e.end_date IS NULL OR e.end_date >= p_period_start);

    RETURN jsonb_build_object(
      'preview', true, 'customers', v_customers, 'lines', v_added_lines,
      'total', v_total, 'period_start', p_period_start, 'period_end', v_pe,
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
      AND COALESCE(e.status::text, 'active') = 'active'
      AND COALESCE(e.start_date, p_period_start) <= v_pe
      AND (e.end_date IS NULL OR e.end_date >= p_period_start)
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

  IF p_issue THEN
    UPDATE public.invoices
       SET status = 'issued',
           issue_date = COALESCE(issue_date, CURRENT_DATE),
           due_date = COALESCE(due_date, v_due),
           updated_at = now()
     WHERE id = ANY(v_ids) AND status = 'draft';
    GET DIAGNOSTICS v_issued = ROW_COUNT;
  END IF;

  SELECT COALESCE(SUM(total),0) INTO v_total FROM public.invoices WHERE id = ANY(v_ids);

  INSERT INTO public.billing_runs(tenant_id, period_start, period_end, status, invoices_created, total_amount, run_by, notes)
  VALUES (p_tenant_id, p_period_start, v_pe, 'completed', v_created_invoices, v_total,
          public.current_profile_id(), 'Daycare — ' || v_period_label)
  RETURNING id INTO v_run_id;

  RETURN jsonb_build_object(
    'created_invoices', v_created_invoices, 'added_lines', v_added_lines,
    'issued_invoices', v_issued, 'total', v_total,
    'invoice_ids', to_jsonb(v_ids),
    'run_id', v_run_id,
    'period_start', p_period_start, 'period_end', v_pe, 'period_label', v_period_label);
END;
$$;

REVOKE ALL ON FUNCTION public.generate_monthly_daycare_invoices(uuid, date, boolean, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.generate_monthly_daycare_invoices(uuid, date, boolean, boolean) TO authenticated, service_role;
DROP FUNCTION IF EXISTS public.generate_monthly_daycare_invoices(uuid, date);

-- 9. One-off cleanup: issue existing non-daycare drafts
UPDATE public.invoices i
   SET status = 'issued',
       issue_date = COALESCE(i.issue_date, CURRENT_DATE),
       due_date = COALESCE(i.due_date, CURRENT_DATE + 14),
       updated_at = now()
 WHERE i.status = 'draft'
   AND NOT EXISTS (
     SELECT 1 FROM public.invoice_items ii
      WHERE ii.invoice_id = i.id AND ii.source_type = 'daycare_enrolment'
   )
   AND EXISTS (SELECT 1 FROM public.invoice_items ii WHERE ii.invoice_id = i.id);