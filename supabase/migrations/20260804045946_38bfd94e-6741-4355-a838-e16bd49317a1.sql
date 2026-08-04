ALTER TABLE public.daycare_enrolments
  ADD COLUMN IF NOT EXISTS paused_from date,
  ADD COLUMN IF NOT EXISTS paused_to date,
  ADD COLUMN IF NOT EXISTS notice_given_at date,
  ADD COLUMN IF NOT EXISTS end_reason text;

ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS collections_hold boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS collections_hold_note text;

-- Earliest legal end date given the notice period in Policies.
CREATE OR REPLACE FUNCTION public.daycare_notice_quote(p_enrolment_id uuid, p_notice_date date DEFAULT CURRENT_DATE)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  e public.daycare_enrolments;
  v_months int;
  v_earliest date;
BEGIN
  SELECT * INTO e FROM public.daycare_enrolments WHERE id = p_enrolment_id;
  IF e.id IS NULL THEN RETURN NULL; END IF;

  SELECT COALESCE(daycare_notice_months, 1) INTO v_months
  FROM public.policy_settings WHERE tenant_id = e.tenant_id;
  v_months := COALESCE(v_months, 1);

  v_earliest := (date_trunc('month', p_notice_date) + (v_months || ' months')::interval - INTERVAL '1 day')::date;

  RETURN jsonb_build_object(
    'enrolment_id', e.id,
    'notice_months', v_months,
    'notice_date', p_notice_date,
    'earliest_end_date', v_earliest
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.daycare_notice_quote(uuid, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.daycare_notice_quote(uuid, date) TO authenticated, service_role;

-- Expected daycare headcount per day against the daily capacity.
CREATE OR REPLACE FUNCTION public.daycare_day_availability(p_tenant_id uuid, p_start date, p_end date)
RETURNS TABLE(day date, expected integer, capacity integer)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH days AS (
    SELECT d::date AS day FROM generate_series(p_start, p_end, INTERVAL '1 day') d
  ),
  cap AS (
    SELECT daily_capacity FROM public.daycare_workflow_settings WHERE tenant_id = p_tenant_id
  )
  SELECT
    days.day,
    (
      SELECT count(*)::int FROM public.daycare_enrolments e
      WHERE e.tenant_id = p_tenant_id
        AND COALESCE(e.active, true)
        AND e.start_date <= days.day
        AND (e.end_date IS NULL OR e.end_date >= days.day)
        AND NOT (e.paused_from IS NOT NULL AND days.day BETWEEN e.paused_from AND COALESCE(e.paused_to, DATE '9999-12-31'))
        AND lower(to_char(days.day, 'Dy')) = ANY (COALESCE(e.selected_days, ARRAY['mon','tue','wed','thu','fri']::text[]))
    ) AS expected,
    (SELECT daily_capacity FROM cap) AS capacity
  FROM days;
$function$;

REVOKE ALL ON FUNCTION public.daycare_day_availability(uuid, date, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.daycare_day_availability(uuid, date, date) TO authenticated, service_role;

-- Monthly run: skip enrolments paused for the whole period.
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
      AND NOT (e.paused_from IS NOT NULL AND e.paused_from <= p_period_start
               AND COALESCE(e.paused_to, DATE '9999-12-31') >= v_pe)
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

-- Overdue interest run: one interest invoice per customer with an overdue balance.
CREATE OR REPLACE FUNCTION public.charge_overdue_interest(p_tenant_id uuid, p_as_of date DEFAULT CURRENT_DATE, p_preview boolean DEFAULT true)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_pct numeric;
  v_terms int;
  r record;
  v_inv uuid;
  v_num text;
  v_amount numeric(12,2);
  v_customers int := 0;
  v_total numeric(12,2) := 0;
  v_ids uuid[] := '{}';
BEGIN
  IF NOT public.user_has_permission(p_tenant_id, 'invoicing.run_monthly') AND NOT public.is_platform_owner() THEN
    RAISE EXCEPTION 'Missing permission invoicing.run_monthly';
  END IF;

  SELECT COALESCE(overdue_interest_percent_per_month, 0) INTO v_pct
  FROM public.policy_settings WHERE tenant_id = p_tenant_id;
  IF COALESCE(v_pct,0) <= 0 THEN
    RETURN jsonb_build_object('preview', p_preview, 'customers', 0, 'total', 0, 'note', 'No interest rate set');
  END IF;

  SELECT COALESCE(payment_terms_days, 14) INTO v_terms
  FROM public.invoicing_settings WHERE tenant_id = p_tenant_id;

  FOR r IN
    SELECT i.customer_id,
           SUM(i.balance_due) AS balance,
           MAX((p_as_of - i.due_date)) AS days_late
    FROM public.invoices i
    JOIN public.customers c ON c.id = i.customer_id
    WHERE i.tenant_id = p_tenant_id
      AND i.balance_due > 0
      AND i.due_date IS NOT NULL
      AND i.due_date < p_as_of
      AND i.status::text IN ('sent','issued','part_paid','overdue')
      AND COALESCE(c.collections_hold, false) = false
    GROUP BY i.customer_id
  LOOP
    v_amount := ROUND(r.balance * (v_pct / 100.0) * (GREATEST(r.days_late,1)::numeric / 30.0), 2);
    IF v_amount <= 0 THEN CONTINUE; END IF;
    v_customers := v_customers + 1;
    v_total := v_total + v_amount;

    IF NOT p_preview THEN
      v_num := public.next_invoice_number(p_tenant_id);
      INSERT INTO public.invoices(tenant_id, customer_id, invoice_number, status, notes, issue_date, due_date)
      VALUES (p_tenant_id, r.customer_id, v_num, 'issued',
              'Interest on overdue balance as at ' || to_char(p_as_of, 'DD Mon YYYY'),
              p_as_of, p_as_of + COALESCE(v_terms,14))
      RETURNING id INTO v_inv;

      INSERT INTO public.invoice_items(tenant_id, invoice_id, description, quantity, unit_price, line_total, sort_order, source_type)
      VALUES (p_tenant_id, v_inv,
              'Interest at ' || to_char(v_pct,'FM990.00') || '% per month on R'
                || to_char(r.balance,'FM999999990.00') || ' overdue (' || r.days_late || ' days)',
              1, v_amount, v_amount, 1, 'late_interest');

      UPDATE public.invoices i SET subtotal = v_amount, total = v_amount,
             balance_due = v_amount - i.amount_paid, updated_at = now()
       WHERE i.id = v_inv;

      v_ids := array_append(v_ids, v_inv);
    END IF;
  END LOOP;

  RETURN jsonb_build_object('preview', p_preview, 'customers', v_customers,
    'total', v_total, 'invoice_ids', to_jsonb(v_ids), 'as_of', p_as_of, 'percent', v_pct);
END;
$function$;

REVOKE ALL ON FUNCTION public.charge_overdue_interest(uuid, date, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.charge_overdue_interest(uuid, date, boolean) TO authenticated, service_role;