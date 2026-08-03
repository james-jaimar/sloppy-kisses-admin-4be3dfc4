ALTER TABLE public.invoicing_settings
  ADD COLUMN IF NOT EXISTS daycare_prorata_enabled boolean NOT NULL DEFAULT true;

CREATE UNIQUE INDEX IF NOT EXISTS uq_invoice_items_source_daycare_prorata
  ON public.invoice_items (source_id)
  WHERE source_type = 'daycare_enrolment_prorata';

-- Quote: how many attendance days remain in the start month, and what that costs.
CREATE OR REPLACE FUNCTION public.daycare_prorata_quote(p_enrolment_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  e public.daycare_enrolments;
  v_price numeric(12,2);
  v_plan text;
  v_ms date;
  v_me date;
  v_days text[];
  v_total int;
  v_billed int;
  v_amount numeric(12,2);
BEGIN
  SELECT * INTO e FROM public.daycare_enrolments WHERE id = p_enrolment_id;
  IF e.id IS NULL OR e.start_date IS NULL THEN RETURN NULL; END IF;

  SELECT COALESCE(dp.price,0), dp.name INTO v_price, v_plan
  FROM public.daycare_plans dp WHERE dp.id = e.daycare_plan_id;
  v_price := COALESCE(v_price, 0);

  v_ms := date_trunc('month', e.start_date)::date;
  v_me := (v_ms + INTERVAL '1 month - 1 day')::date;
  IF e.end_date IS NOT NULL AND e.end_date < v_me THEN v_me := e.end_date; END IF;

  v_days := COALESCE(e.selected_days, ARRAY['mon','tue','wed','thu','fri']::text[]);

  SELECT count(*) INTO v_total FROM generate_series(v_ms, (date_trunc('month', e.start_date) + INTERVAL '1 month - 1 day')::date, INTERVAL '1 day') d
    WHERE lower(to_char(d, 'Dy')) = ANY (v_days);

  SELECT count(*) INTO v_billed FROM generate_series(e.start_date, v_me, INTERVAL '1 day') d
    WHERE lower(to_char(d, 'Dy')) = ANY (v_days);

  IF COALESCE(v_total,0) = 0 THEN RETURN NULL; END IF;

  v_amount := ROUND(v_price * v_billed::numeric / v_total::numeric, 2);

  RETURN jsonb_build_object(
    'enrolment_id', e.id,
    'plan_name', v_plan,
    'plan_price', v_price,
    'days_total', v_total,
    'days_billed', v_billed,
    'amount', v_amount,
    'period_start', e.start_date,
    'period_end', v_me,
    'is_partial', e.start_date <> v_ms
  );
END;
$$;

REVOKE ALL ON FUNCTION public.daycare_prorata_quote(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.daycare_prorata_quote(uuid) TO authenticated, service_role;

-- Create + issue the standalone pro-rata invoice for a mid-month enrolment.
CREATE OR REPLACE FUNCTION public.ensure_daycare_prorata_invoice(p_enrolment_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  e public.daycare_enrolments;
  q jsonb;
  v_enabled boolean;
  v_terms int;
  v_inv uuid;
  v_num text;
  v_desc text;
  v_amount numeric(12,2);
BEGIN
  SELECT * INTO e FROM public.daycare_enrolments WHERE id = p_enrolment_id;
  IF e.id IS NULL OR e.start_date IS NULL THEN RETURN NULL; END IF;
  IF COALESCE(e.active, true) = false THEN RETURN NULL; END IF;

  SELECT COALESCE(daycare_prorata_enabled, true), COALESCE(payment_terms_days, 14)
    INTO v_enabled, v_terms
  FROM public.invoicing_settings WHERE tenant_id = e.tenant_id;
  IF COALESCE(v_enabled, true) = false THEN RETURN NULL; END IF;
  v_terms := COALESCE(v_terms, 14);

  -- Already billed?
  SELECT ii.invoice_id INTO v_inv FROM public.invoice_items ii
  WHERE ii.source_type = 'daycare_enrolment_prorata' AND ii.source_id = e.id LIMIT 1;
  IF v_inv IS NOT NULL THEN RETURN v_inv; END IF;

  q := public.daycare_prorata_quote(p_enrolment_id);
  IF q IS NULL OR (q->>'is_partial')::boolean = false THEN RETURN NULL; END IF;

  v_amount := (q->>'amount')::numeric;
  IF COALESCE(v_amount,0) <= 0 THEN RETURN NULL; END IF;

  v_num := public.next_invoice_number(e.tenant_id);

  INSERT INTO public.invoices(
    tenant_id, customer_id, invoice_number, status, notes,
    billing_period_start, billing_period_end, issue_date, due_date
  ) VALUES (
    e.tenant_id, e.customer_id, v_num, 'issued',
    'Daycare pro-rata — ' || to_char((q->>'period_start')::date, 'DD Mon YYYY')
      || ' to ' || to_char((q->>'period_end')::date, 'DD Mon YYYY'),
    (q->>'period_start')::date, (q->>'period_end')::date,
    CURRENT_DATE, CURRENT_DATE + v_terms
  ) RETURNING id INTO v_inv;

  v_desc := 'Daycare — ' || COALESCE(q->>'plan_name', 'Drop-in')
    || COALESCE((SELECT ' (' || p.name || ')' FROM public.pets p WHERE p.id = e.pet_id), '')
    || ' — pro-rata ' || to_char((q->>'period_start')::date, 'DD')
    || '–' || to_char((q->>'period_end')::date, 'DD Mon YYYY')
    || ' (' || (q->>'days_billed') || ' of ' || (q->>'days_total') || ' days)';

  INSERT INTO public.invoice_items(
    tenant_id, invoice_id, description, quantity, unit_price, line_total,
    sort_order, source_type, source_id
  ) VALUES (
    e.tenant_id, v_inv, v_desc, 1, v_amount, v_amount, 1,
    'daycare_enrolment_prorata', e.id
  );

  UPDATE public.invoices i SET
    subtotal = (SELECT COALESCE(SUM(line_total),0) FROM public.invoice_items WHERE invoice_id = i.id),
    total    = (SELECT COALESCE(SUM(line_total),0) FROM public.invoice_items WHERE invoice_id = i.id),
    balance_due = (SELECT COALESCE(SUM(line_total),0) FROM public.invoice_items WHERE invoice_id = i.id) - i.amount_paid,
    updated_at = now()
  WHERE i.id = v_inv;

  RETURN v_inv;
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_daycare_prorata_invoice(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ensure_daycare_prorata_invoice(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.daycare_enrolments_prorata_invoice()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  PERFORM public.ensure_daycare_prorata_invoice(NEW.id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_daycare_enrolments_prorata ON public.daycare_enrolments;
CREATE TRIGGER trg_daycare_enrolments_prorata
AFTER INSERT ON public.daycare_enrolments
FOR EACH ROW EXECUTE FUNCTION public.daycare_enrolments_prorata_invoice();

-- Monthly run: use the real `active` flag and skip periods already covered by a pro-rata invoice.
CREATE OR REPLACE FUNCTION public.generate_monthly_daycare_invoices(p_tenant_id uuid, p_period_start date, p_preview boolean DEFAULT false, p_issue boolean DEFAULT true)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
      AND NOT EXISTS (
        SELECT 1 FROM public.invoice_items ii
        JOIN public.invoices inv ON inv.id = ii.invoice_id
        WHERE ii.source_type = 'daycare_enrolment_prorata' AND ii.source_id = e.id
          AND inv.billing_period_end BETWEEN p_period_start AND v_pe
      );

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
      AND COALESCE(e.active, true)
      AND COALESCE(e.start_date, p_period_start) <= v_pe
      AND (e.end_date IS NULL OR e.end_date >= p_period_start)
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
    'issued', v_issued,
    'invoice_ids', to_jsonb(v_ids),
    'period_start', p_period_start,
    'period_end', v_pe,
    'period_label', v_period_label);
END;
$function$;

REVOKE ALL ON FUNCTION public.generate_monthly_daycare_invoices(uuid, date, boolean, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.generate_monthly_daycare_invoices(uuid, date, boolean, boolean) TO authenticated, service_role;