
-- 1. Invoice billing period columns
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS billing_period_start date,
  ADD COLUMN IF NOT EXISTS billing_period_end date;

CREATE INDEX IF NOT EXISTS idx_invoices_period
  ON public.invoices(tenant_id, customer_id, billing_period_start);

-- 2. Invoicing settings columns
ALTER TABLE public.invoicing_settings
  ADD COLUMN IF NOT EXISTS billing_cycle text NOT NULL DEFAULT 'monthly_prepaid',
  ADD COLUMN IF NOT EXISTS billing_run_day smallint NOT NULL DEFAULT 22,
  ADD COLUMN IF NOT EXISTS billing_due_day smallint NOT NULL DEFAULT 1;

-- 3. Uniqueness guard on invoice_items for repeat monthly runs
CREATE UNIQUE INDEX IF NOT EXISTS uq_invoice_items_source_daycare_enrolment
  ON public.invoice_items(invoice_id, source_id)
  WHERE source_type = 'daycare_enrolment';

-- 4. New ensure_draft_invoice signature (period-aware). Drop the 2-arg version.
DROP FUNCTION IF EXISTS public.ensure_draft_invoice(uuid, uuid);

CREATE OR REPLACE FUNCTION public.ensure_draft_invoice(
  p_tenant_id uuid, p_customer_id uuid,
  p_period_start date DEFAULT NULL, p_period_end date DEFAULT NULL,
  p_notes_label text DEFAULT 'Auto-created'
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_num text;
  v_issue date;
  v_due date;
BEGIN
  IF p_period_start IS NOT NULL THEN
    SELECT id INTO v_id FROM public.invoices
    WHERE tenant_id = p_tenant_id AND customer_id = p_customer_id
      AND status = 'draft' AND billing_period_start = p_period_start
    ORDER BY created_at DESC LIMIT 1;
  ELSE
    SELECT id INTO v_id FROM public.invoices
    WHERE tenant_id = p_tenant_id AND customer_id = p_customer_id
      AND status = 'draft' AND billing_period_start IS NULL
    ORDER BY created_at DESC LIMIT 1;
  END IF;

  IF v_id IS NOT NULL THEN RETURN v_id; END IF;

  v_num := public.next_invoice_number(p_tenant_id);
  IF p_period_start IS NOT NULL THEN
    v_issue := p_period_start - INTERVAL '9 days';
    v_due   := p_period_start;
  END IF;

  INSERT INTO public.invoices(
    tenant_id, customer_id, invoice_number, status, notes,
    billing_period_start, billing_period_end, issue_date, due_date
  )
  VALUES (
    p_tenant_id, p_customer_id, v_num, 'draft', p_notes_label,
    p_period_start, p_period_end, v_issue, v_due
  )
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_draft_invoice(uuid, uuid, date, date, text) FROM PUBLIC, anon, authenticated;

-- 5. Helper: period bounds for a given anchor date (start-of-month .. end-of-month)
CREATE OR REPLACE FUNCTION public._period_bounds(p_anchor date)
RETURNS TABLE(period_start date, period_end date)
LANGUAGE sql IMMUTABLE
AS $$
  SELECT date_trunc('month', p_anchor)::date,
         (date_trunc('month', p_anchor) + INTERVAL '1 month - 1 day')::date;
$$;

-- 6. Rewrite daycare trigger — ALWAYS bill next month
CREATE OR REPLACE FUNCTION public.daycare_enrolments_auto_invoice()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_inv uuid; v_plan public.daycare_plans; v_pet_name text;
  v_desc text; v_price numeric(12,2); v_next_sort integer;
  v_ps date; v_pe date; v_period_label text;
BEGIN
  IF NEW.invoice_id IS NOT NULL THEN RETURN NEW; END IF;
  IF NOT COALESCE(public._auto_invoice_enabled(NEW.tenant_id, 'daycare'), true) THEN RETURN NEW; END IF;

  SELECT name INTO v_pet_name FROM public.pets WHERE id = NEW.pet_id;
  IF NEW.daycare_plan_id IS NOT NULL THEN
    SELECT * INTO v_plan FROM public.daycare_plans WHERE id = NEW.daycare_plan_id;
  END IF;
  v_price := COALESCE(v_plan.price, 0);

  -- Always next month from today
  SELECT period_start, period_end INTO v_ps, v_pe
  FROM public._period_bounds((date_trunc('month', now()::date) + INTERVAL '1 month')::date);
  v_period_label := to_char(v_ps, 'Mon YYYY');

  v_desc := 'Daycare — ' || COALESCE(v_plan.name, 'Drop-in')
            || CASE WHEN v_pet_name IS NOT NULL THEN ' (' || v_pet_name || ')' ELSE '' END
            || ' — ' || v_period_label;

  v_inv := public.ensure_draft_invoice(NEW.tenant_id, NEW.customer_id, v_ps, v_pe, 'Daycare — ' || v_period_label);
  SELECT COALESCE(MAX(sort_order),0)+1 INTO v_next_sort FROM public.invoice_items WHERE invoice_id = v_inv;

  INSERT INTO public.invoice_items(tenant_id, invoice_id, description, quantity, unit_price, line_total, sort_order, source_type, source_id)
  VALUES (NEW.tenant_id, v_inv, v_desc, 1, v_price, ROUND(v_price, 2), v_next_sort, 'daycare_enrolment', NEW.id)
  ON CONFLICT DO NOTHING;

  UPDATE public.daycare_enrolments SET invoice_id = v_inv WHERE id = NEW.id;

  UPDATE public.invoices i SET
    subtotal = (SELECT COALESCE(SUM(line_total),0) FROM public.invoice_items WHERE invoice_id = i.id),
    total    = (SELECT COALESCE(SUM(line_total),0) FROM public.invoice_items WHERE invoice_id = i.id),
    balance_due = (SELECT COALESCE(SUM(line_total),0) FROM public.invoice_items WHERE invoice_id = i.id) - i.amount_paid,
    updated_at = now()
  WHERE i.id = v_inv;

  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.daycare_enrolments_auto_invoice() FROM PUBLIC, anon, authenticated;

-- 7. Rewrite grooming trigger — period from booking start
CREATE OR REPLACE FUNCTION public.grooming_details_auto_invoice()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_booking public.bookings; v_pkg public.grooming_packages; v_pet_name text;
  v_inv uuid; v_sort integer; v_pkg_price numeric(12,2);
  v_ps date; v_pe date; v_period_label text; v_anchor date;
BEGIN
  SELECT * INTO v_booking FROM public.bookings WHERE id = NEW.booking_id;
  IF v_booking.id IS NULL OR v_booking.invoice_id IS NOT NULL THEN RETURN NEW; END IF;
  IF NOT COALESCE(public._auto_invoice_enabled(NEW.tenant_id, 'grooming'), true) THEN RETURN NEW; END IF;

  v_anchor := COALESCE(v_booking.start_at::date, now()::date);
  SELECT period_start, period_end INTO v_ps, v_pe FROM public._period_bounds(v_anchor);
  v_period_label := to_char(v_ps, 'Mon YYYY');

  IF NEW.package_id IS NOT NULL THEN
    SELECT * INTO v_pkg FROM public.grooming_packages WHERE id = NEW.package_id;
  END IF;
  v_pkg_price := COALESCE(v_pkg.price_zar, 0);

  SELECT p.name INTO v_pet_name
  FROM public.booking_pets bp JOIN public.pets p ON p.id = bp.pet_id
  WHERE bp.booking_id = v_booking.id LIMIT 1;

  v_inv := public.ensure_draft_invoice(v_booking.tenant_id, v_booking.customer_id, v_ps, v_pe, 'Services — ' || v_period_label);
  UPDATE public.bookings SET invoice_id = v_inv WHERE id = v_booking.id;

  SELECT COALESCE(MAX(sort_order),0)+1 INTO v_sort FROM public.invoice_items WHERE invoice_id = v_inv;

  INSERT INTO public.invoice_items(tenant_id, invoice_id, booking_id, description, quantity, unit_price, line_total, sort_order)
  VALUES (v_booking.tenant_id, v_inv, v_booking.id,
    'Grooming — ' || COALESCE(v_pkg.name, COALESCE(NEW.service_package, 'Service'))
      || CASE WHEN v_pet_name IS NOT NULL THEN ' (' || v_pet_name || ')' ELSE '' END,
    1, v_pkg_price, ROUND(v_pkg_price,2), v_sort);
  v_sort := v_sort + 1;

  IF COALESCE(NEW.travel_fee,0) > 0 THEN
    INSERT INTO public.invoice_items(tenant_id, invoice_id, booking_id, description, quantity, unit_price, line_total, sort_order)
    VALUES (v_booking.tenant_id, v_inv, v_booking.id, 'Mobile travel fee', 1, NEW.travel_fee, ROUND(NEW.travel_fee,2), v_sort);
    v_sort := v_sort + 1;
  END IF;
  IF COALESCE(NEW.matted_surcharge_zar,0) > 0 THEN
    INSERT INTO public.invoice_items(tenant_id, invoice_id, booking_id, description, quantity, unit_price, line_total, sort_order)
    VALUES (v_booking.tenant_id, v_inv, v_booking.id, 'Matted coat surcharge', 1, NEW.matted_surcharge_zar, ROUND(NEW.matted_surcharge_zar,2), v_sort);
    v_sort := v_sort + 1;
  END IF;
  IF COALESCE(NEW.sedation_surcharge_zar,0) > 0 THEN
    INSERT INTO public.invoice_items(tenant_id, invoice_id, booking_id, description, quantity, unit_price, line_total, sort_order)
    VALUES (v_booking.tenant_id, v_inv, v_booking.id, 'Sedation surcharge', 1, NEW.sedation_surcharge_zar, ROUND(NEW.sedation_surcharge_zar,2), v_sort);
  END IF;

  UPDATE public.invoices i SET
    subtotal = (SELECT COALESCE(SUM(line_total),0) FROM public.invoice_items WHERE invoice_id = i.id),
    total    = (SELECT COALESCE(SUM(line_total),0) FROM public.invoice_items WHERE invoice_id = i.id),
    balance_due = (SELECT COALESCE(SUM(line_total),0) FROM public.invoice_items WHERE invoice_id = i.id) - i.amount_paid,
    updated_at = now()
  WHERE i.id = v_inv;

  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.grooming_details_auto_invoice() FROM PUBLIC, anon, authenticated;

-- 8. Rewrite hotel trigger — period from booking start_date
CREATE OR REPLACE FUNCTION public.hotel_details_auto_invoice()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_booking public.bookings; v_pet_name text; v_nights integer;
  v_inv uuid; v_sort integer;
  v_ps date; v_pe date; v_period_label text; v_anchor date;
BEGIN
  SELECT * INTO v_booking FROM public.bookings WHERE id = NEW.booking_id;
  IF v_booking.id IS NULL OR v_booking.invoice_id IS NOT NULL THEN RETURN NEW; END IF;
  IF NOT COALESCE(public._auto_invoice_enabled(NEW.tenant_id, 'hotel'), true) THEN RETURN NEW; END IF;

  v_anchor := COALESCE(v_booking.start_date, v_booking.start_at::date, now()::date);
  SELECT period_start, period_end INTO v_ps, v_pe FROM public._period_bounds(v_anchor);
  v_period_label := to_char(v_ps, 'Mon YYYY');

  v_nights := GREATEST(1, COALESCE(
    (v_booking.end_date - v_booking.start_date),
    (EXTRACT(EPOCH FROM (v_booking.end_at - v_booking.start_at))/86400)::int,
    1));

  SELECT p.name INTO v_pet_name
  FROM public.booking_pets bp JOIN public.pets p ON p.id = bp.pet_id
  WHERE bp.booking_id = v_booking.id LIMIT 1;

  v_inv := public.ensure_draft_invoice(v_booking.tenant_id, v_booking.customer_id, v_ps, v_pe, 'Services — ' || v_period_label);
  UPDATE public.bookings SET invoice_id = v_inv WHERE id = v_booking.id;

  SELECT COALESCE(MAX(sort_order),0)+1 INTO v_sort FROM public.invoice_items WHERE invoice_id = v_inv;

  INSERT INTO public.invoice_items(tenant_id, invoice_id, booking_id, description, quantity, unit_price, line_total, sort_order)
  VALUES (v_booking.tenant_id, v_inv, v_booking.id,
    'Hotel stay — ' || COALESCE(NEW.accommodation_type, 'boarding')
      || CASE WHEN v_pet_name IS NOT NULL THEN ' (' || v_pet_name || ')' ELSE '' END,
    v_nights, 0, 0, v_sort);

  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.hotel_details_auto_invoice() FROM PUBLIC, anon, authenticated;

-- 9. Rewrite transport trigger
CREATE OR REPLACE FUNCTION public.transport_details_auto_invoice()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_booking public.bookings; v_inv uuid; v_sort integer;
  v_ps date; v_pe date; v_period_label text; v_anchor date;
BEGIN
  SELECT * INTO v_booking FROM public.bookings WHERE id = NEW.booking_id;
  IF v_booking.id IS NULL OR v_booking.invoice_id IS NOT NULL THEN RETURN NEW; END IF;
  IF NOT COALESCE(public._auto_invoice_enabled(NEW.tenant_id, 'transport'), true) THEN RETURN NEW; END IF;

  v_anchor := COALESCE(v_booking.start_at::date, now()::date);
  SELECT period_start, period_end INTO v_ps, v_pe FROM public._period_bounds(v_anchor);
  v_period_label := to_char(v_ps, 'Mon YYYY');

  v_inv := public.ensure_draft_invoice(v_booking.tenant_id, v_booking.customer_id, v_ps, v_pe, 'Services — ' || v_period_label);
  UPDATE public.bookings SET invoice_id = v_inv WHERE id = v_booking.id;

  SELECT COALESCE(MAX(sort_order),0)+1 INTO v_sort FROM public.invoice_items WHERE invoice_id = v_inv;

  INSERT INTO public.invoice_items(tenant_id, invoice_id, booking_id, description, quantity, unit_price, line_total, sort_order)
  VALUES (v_booking.tenant_id, v_inv, v_booking.id,
    'Transport — ' || COALESCE(NEW.direction, 'trip'),
    1, 0, 0, v_sort);

  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.transport_details_auto_invoice() FROM PUBLIC, anon, authenticated;

-- 10. Monthly billing run RPC
CREATE OR REPLACE FUNCTION public.generate_monthly_daycare_invoices(
  p_tenant_id uuid, p_period_start date
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
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
BEGIN
  IF NOT public.user_has_permission(p_tenant_id, 'invoicing.run_monthly') AND NOT public.is_platform_owner() THEN
    RAISE EXCEPTION 'Missing permission invoicing.run_monthly';
  END IF;

  v_pe := (date_trunc('month', p_period_start) + INTERVAL '1 month - 1 day')::date;
  v_period_label := to_char(p_period_start, 'Mon YYYY');

  FOR r IN
    SELECT e.id AS enrolment_id, e.tenant_id, e.customer_id, e.pet_id,
           e.daycare_plan_id, e.start_date, e.end_date,
           dp.name AS plan_name, dp.price AS plan_price,
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

    SELECT COALESCE(MAX(sort_order),0)+1 INTO v_next_sort FROM public.invoice_items WHERE invoice_id = v_inv;

    BEGIN
      INSERT INTO public.invoice_items(tenant_id, invoice_id, description, quantity, unit_price, line_total, sort_order, source_type, source_id)
      VALUES (p_tenant_id, v_inv, v_desc, 1, v_price, ROUND(v_price,2), v_next_sort, 'daycare_enrolment', r.enrolment_id);
      v_added_lines := v_added_lines + 1;
    EXCEPTION WHEN unique_violation THEN
      -- already present for this enrolment on this invoice
      NULL;
    END;

    UPDATE public.invoices i SET
      subtotal = (SELECT COALESCE(SUM(line_total),0) FROM public.invoice_items WHERE invoice_id = i.id),
      total    = (SELECT COALESCE(SUM(line_total),0) FROM public.invoice_items WHERE invoice_id = i.id),
      balance_due = (SELECT COALESCE(SUM(line_total),0) FROM public.invoice_items WHERE invoice_id = i.id) - i.amount_paid,
      updated_at = now()
    WHERE i.id = v_inv;
  END LOOP;

  RETURN jsonb_build_object('created_invoices', v_created_invoices, 'added_lines', v_added_lines,
                            'period_start', p_period_start, 'period_end', v_pe);
END;
$$;

GRANT EXECUTE ON FUNCTION public.generate_monthly_daycare_invoices(uuid, date) TO authenticated;

-- 11. Permission
INSERT INTO public.permissions(code, label, description)
VALUES ('invoicing.run_monthly', 'Run monthly billing', 'Generate the next month''s daycare invoices in one click.')
ON CONFLICT (code) DO NOTHING;
