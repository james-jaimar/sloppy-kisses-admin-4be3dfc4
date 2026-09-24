
CREATE OR REPLACE FUNCTION public._daycare_count_days(p_from date, p_to date, p_days text[])
RETURNS integer LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT COUNT(*)::int FROM generate_series(p_from, p_to, interval '1 day') g(d)
  WHERE p_from <= p_to AND (CASE WHEN COALESCE(array_length(p_days,1),0)=0
     THEN extract(isodow FROM g.d) BETWEEN 1 AND 5
     ELSE lower(to_char(g.d,'Dy')) = ANY(p_days) END);
$$;

CREATE OR REPLACE FUNCTION public.generate_monthly_daycare_invoices(p_tenant_id uuid, p_period_start date, p_preview boolean DEFAULT false, p_issue boolean DEFAULT true)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_pe date; v_period_label text; v_created_invoices int := 0; v_added_lines int := 0;
  v_before_invoices int; r record; v_inv uuid; v_price numeric(12,2); v_desc text;
  v_next_sort integer; v_total numeric(12,2) := 0; v_customers int := 0; v_issued int := 0;
  v_due_day smallint; v_due date; v_ids uuid[] := '{}'; v_credit_total numeric(12,2) := 0;
  v_credit_lines int := 0; v_all int; v_used int;
BEGIN
  IF NOT public.user_has_permission(p_tenant_id, 'invoicing.run_monthly') AND NOT public.is_platform_owner() THEN
    RAISE EXCEPTION 'Missing permission invoicing.run_monthly';
  END IF;
  v_pe := (date_trunc('month', p_period_start) + INTERVAL '1 month - 1 day')::date;
  v_period_label := to_char(p_period_start, 'Mon YYYY');

  IF p_preview THEN
    SELECT COUNT(DISTINCT e.customer_id), COUNT(*),
      COALESCE(SUM(CASE WHEN e.end_date IS NOT NULL AND e.end_date < v_pe
        THEN ROUND(COALESCE(dp.price,0) * public._daycare_count_days(p_period_start, e.end_date, e.selected_days)
             / NULLIF(public._daycare_count_days(p_period_start, v_pe, e.selected_days),0), 2)
        ELSE COALESCE(dp.price,0) END),0)
      INTO v_customers, v_added_lines, v_total
    FROM public.daycare_enrolments e
    LEFT JOIN public.daycare_plans dp ON dp.id = e.daycare_plan_id
    WHERE e.tenant_id = p_tenant_id AND COALESCE(e.active, true)
      AND COALESCE(e.start_date, p_period_start) <= v_pe
      AND (e.end_date IS NULL OR e.end_date >= p_period_start)
      AND NOT (e.paused_from IS NOT NULL AND e.paused_from <= p_period_start
               AND COALESCE(e.paused_to, DATE '9999-12-31') >= v_pe)
      AND NOT EXISTS (SELECT 1 FROM public.invoice_items ii JOIN public.invoices inv ON inv.id = ii.invoice_id
        WHERE ii.source_type = 'daycare_enrolment_prorata' AND ii.source_id = e.id
          AND inv.billing_period_end BETWEEN p_period_start AND v_pe);
    SELECT COUNT(*), COALESCE(SUM(amount_zar),0) INTO v_credit_lines, v_credit_total
      FROM public.hotel_daycare_credits WHERE tenant_id = p_tenant_id AND status = 'pending';
    RETURN jsonb_build_object('preview', true, 'customers', v_customers, 'lines', v_added_lines,
      'total', v_total - v_credit_total, 'gross_total', v_total,
      'hotel_credit_lines', v_credit_lines, 'hotel_credit_total', v_credit_total,
      'period_start', p_period_start, 'period_end', v_pe, 'period_label', v_period_label);
  END IF;

  SELECT COALESCE(billing_due_day, 1) INTO v_due_day FROM public.invoicing_settings WHERE tenant_id = p_tenant_id;
  v_due := (date_trunc('month', p_period_start) + ((COALESCE(v_due_day,1) - 1) || ' days')::interval)::date;

  FOR r IN
    SELECT e.id AS enrolment_id, e.tenant_id, e.customer_id, e.pet_id, e.end_date, e.selected_days,
           e.notice_given_at, e.daycare_plan_id, dp.name AS plan_name, dp.price AS plan_price, pt.name AS pet_name
    FROM public.daycare_enrolments e
    LEFT JOIN public.daycare_plans dp ON dp.id = e.daycare_plan_id
    LEFT JOIN public.pets pt ON pt.id = e.pet_id
    WHERE e.tenant_id = p_tenant_id AND COALESCE(e.active, true)
      AND COALESCE(e.start_date, p_period_start) <= v_pe
      AND (e.end_date IS NULL OR e.end_date >= p_period_start)
      AND NOT (e.paused_from IS NOT NULL AND e.paused_from <= p_period_start
               AND COALESCE(e.paused_to, DATE '9999-12-31') >= v_pe)
      AND NOT EXISTS (SELECT 1 FROM public.invoice_items ii JOIN public.invoices inv ON inv.id = ii.invoice_id
        WHERE ii.source_type = 'daycare_enrolment_prorata' AND ii.source_id = e.id
          AND inv.billing_period_end BETWEEN p_period_start AND v_pe)
  LOOP
    v_price := COALESCE(r.plan_price, 0);
    v_desc := 'Daycare — ' || COALESCE(r.plan_name, 'Drop-in')
              || CASE WHEN r.pet_name IS NOT NULL THEN ' (' || r.pet_name || ')' ELSE '' END
              || ' — ' || v_period_label;
    IF r.end_date IS NOT NULL AND r.end_date < v_pe THEN
      v_all := public._daycare_count_days(p_period_start, v_pe, r.selected_days);
      v_used := public._daycare_count_days(p_period_start, r.end_date, r.selected_days);
      IF v_all > 0 THEN v_price := ROUND(v_price * v_used / v_all, 2); END IF;
      v_desc := v_desc || ' · final month, ' || v_used || ' of ' || v_all || ' days to '
        || to_char(r.end_date, 'DD Mon') ||
        CASE WHEN r.notice_given_at IS NOT NULL THEN ' (notice given ' || to_char(r.notice_given_at,'DD Mon YYYY') || ')' ELSE '' END;
    END IF;

    SELECT count(*) INTO v_before_invoices FROM public.invoices
      WHERE tenant_id = p_tenant_id AND customer_id = r.customer_id AND status = 'draft' AND billing_period_start = p_period_start;
    v_inv := public.ensure_draft_invoice(p_tenant_id, r.customer_id, p_period_start, v_pe, 'Daycare — ' || v_period_label);
    IF v_before_invoices = 0 THEN v_created_invoices := v_created_invoices + 1; END IF;
    IF NOT (v_inv = ANY(v_ids)) THEN v_ids := array_append(v_ids, v_inv); END IF;
    SELECT COALESCE(MAX(sort_order),0)+1 INTO v_next_sort FROM public.invoice_items WHERE invoice_id = v_inv;
    BEGIN
      INSERT INTO public.invoice_items(tenant_id, invoice_id, description, quantity, unit_price, line_total, sort_order, source_type, source_id)
      VALUES (p_tenant_id, v_inv, v_desc, 1, v_price, ROUND(v_price,2), v_next_sort, 'daycare_enrolment', r.enrolment_id);
      v_added_lines := v_added_lines + 1;
    EXCEPTION WHEN unique_violation THEN NULL;
    END;
    UPDATE public.invoices i SET
      subtotal = (SELECT COALESCE(SUM(line_total),0) FROM public.invoice_items WHERE invoice_id = i.id),
      total    = (SELECT COALESCE(SUM(line_total),0) FROM public.invoice_items WHERE invoice_id = i.id),
      balance_due = (SELECT COALESCE(SUM(line_total),0) FROM public.invoice_items WHERE invoice_id = i.id) - i.amount_paid,
      updated_at = now()
    WHERE i.id = v_inv;
  END LOOP;

  FOR r IN
    SELECT c.id AS credit_id, c.customer_id, c.amount_zar, c.nights, c.daily_rate_zar, p.name AS pet_name, b.booking_number
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
    UPDATE public.hotel_daycare_credits SET status = 'applied', applied_invoice_id = v_inv, updated_at = now() WHERE id = r.credit_id;
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
    UPDATE public.invoices SET status = 'issued', issue_date = COALESCE(issue_date, CURRENT_DATE),
           due_date = COALESCE(due_date, v_due), updated_at = now()
     WHERE id = ANY(v_ids) AND status = 'draft';
    GET DIAGNOSTICS v_issued = ROW_COUNT;
  END IF;

  RETURN jsonb_build_object('preview', false, 'invoices', v_created_invoices, 'lines', v_added_lines,
    'hotel_credit_lines', v_credit_lines, 'hotel_credit_total', v_credit_total, 'issued', v_issued,
    'invoice_ids', to_jsonb(v_ids), 'period_start', p_period_start, 'period_end', v_pe, 'period_label', v_period_label);
END;
$function$;

-- End a daycare enrolment: record notice + leaving date, and give back any days already billed after it.
CREATE OR REPLACE FUNCTION public.daycare_end_enrolment(p_enrolment_id uuid, p_end_date date, p_notice_date date DEFAULT NULL, p_reason text DEFAULT NULL, p_preview boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  e public.daycare_enrolments; r record; v_all int; v_unused int; v_amt numeric(12,2);
  v_cn uuid; v_num text; v_bal numeric(12,2); v_apply numeric(12,2);
  v_out jsonb := '[]'::jsonb; v_total numeric(12,2) := 0; v_pet text;
BEGIN
  SELECT * INTO e FROM public.daycare_enrolments WHERE id = p_enrolment_id;
  IF e.id IS NULL THEN RAISE EXCEPTION 'Enrolment not found'; END IF;
  IF NOT public.user_has_tenant_access(e.tenant_id) AND NOT public.is_platform_owner() THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;
  IF p_end_date IS NULL THEN RAISE EXCEPTION 'Leaving date is required'; END IF;
  IF p_end_date < e.start_date THEN RAISE EXCEPTION 'Leaving date is before the start date'; END IF;
  SELECT name INTO v_pet FROM public.pets WHERE id = e.pet_id;

  FOR r IN
    SELECT ii.id AS item_id, ii.line_total, ii.description, inv.id AS invoice_id, inv.status, inv.invoice_number,
           GREATEST(COALESCE(inv.billing_period_start, e.start_date), e.start_date) AS ps,
           COALESCE(inv.billing_period_end, (date_trunc('month', e.start_date) + interval '1 month - 1 day')::date) AS pe
      FROM public.invoice_items ii JOIN public.invoices inv ON inv.id = ii.invoice_id
     WHERE ii.source_id = e.id AND ii.source_type IN ('daycare_enrolment','daycare_enrolment_prorata')
       AND inv.status <> 'cancelled' AND ii.line_total > 0
       AND COALESCE(inv.billing_period_end, p_end_date + 1) > p_end_date
       AND NOT EXISTS (SELECT 1 FROM public.credit_note_items ci JOIN public.credit_notes cn ON cn.id = ci.credit_note_id
                        WHERE ci.item_code = 'daycare_end:' || ii.id AND cn.status <> 'cancelled')
  LOOP
    v_all := public._daycare_count_days(r.ps, r.pe, e.selected_days);
    v_unused := public._daycare_count_days(GREATEST(p_end_date + 1, r.ps), r.pe, e.selected_days);
    IF v_all = 0 OR v_unused = 0 THEN CONTINUE; END IF;
    v_amt := ROUND(r.line_total * v_unused / v_all, 2);
    IF v_amt <= 0 THEN CONTINUE; END IF;
    v_total := v_total + v_amt;
    v_out := v_out || jsonb_build_object('invoice_number', r.invoice_number, 'invoice_status', r.status,
      'unused_days', v_unused, 'total_days', v_all, 'amount', v_amt,
      'action', CASE WHEN r.status = 'draft' THEN 'reduce_draft' ELSE 'credit_note' END);
    IF p_preview THEN CONTINUE; END IF;

    IF r.status = 'draft' THEN
      UPDATE public.invoice_items SET unit_price = line_total - v_amt, line_total = line_total - v_amt,
        description = description || ' · to ' || to_char(p_end_date,'DD Mon') || ' (leaving)'
       WHERE id = r.item_id;
      UPDATE public.invoices i SET
        subtotal = (SELECT COALESCE(SUM(line_total),0) FROM public.invoice_items WHERE invoice_id = i.id),
        total    = (SELECT COALESCE(SUM(line_total),0) FROM public.invoice_items WHERE invoice_id = i.id),
        balance_due = (SELECT COALESCE(SUM(line_total),0) FROM public.invoice_items WHERE invoice_id = i.id) - i.amount_paid,
        updated_at = now()
      WHERE i.id = r.invoice_id;
    ELSE
      v_num := public.next_credit_note_number(e.tenant_id);
      INSERT INTO public.credit_notes(tenant_id, credit_note_number, customer_id, invoice_id, status, reason, notes, created_by)
      VALUES (e.tenant_id, v_num, e.customer_id, r.invoice_id, 'draft',
        'Daycare ended' || COALESCE(' — ' || NULLIF(p_reason,''), ''),
        'Leaving ' || to_char(p_end_date,'DD Mon YYYY') || COALESCE(', notice given ' || to_char(p_notice_date,'DD Mon YYYY'), ''),
        auth.uid())
      RETURNING id INTO v_cn;
      INSERT INTO public.credit_note_items(tenant_id, credit_note_id, description, quantity, unit_price, line_total, sort_order, item_code)
      VALUES (e.tenant_id, v_cn, 'Daycare not used' || COALESCE(' (' || v_pet || ')', '') || ' — '
        || v_unused || ' of ' || v_all || ' days after ' || to_char(p_end_date,'DD Mon YYYY'),
        1, v_amt, v_amt, 1, 'daycare_end:' || r.item_id);
      UPDATE public.credit_notes SET status = 'issued', issue_date = CURRENT_DATE WHERE id = v_cn;
      -- If the invoice is still owing, knock the credit straight off it; any rest stays for refund / account credit.
      SELECT balance_due INTO v_bal FROM public.invoices WHERE id = r.invoice_id;
      v_apply := LEAST(v_amt, GREATEST(COALESCE(v_bal,0),0));
      IF v_apply > 0 THEN
        INSERT INTO public.credit_note_applications(tenant_id, credit_note_id, invoice_id, amount)
        VALUES (e.tenant_id, v_cn, r.invoice_id, v_apply);
      END IF;
      v_out := jsonb_set(v_out, ARRAY[(jsonb_array_length(v_out)-1)::text, 'credit_note_number'], to_jsonb(v_num));
      v_out := jsonb_set(v_out, ARRAY[(jsonb_array_length(v_out)-1)::text, 'applied_to_invoice'], to_jsonb(v_apply));
    END IF;
  END LOOP;

  IF NOT p_preview THEN
    UPDATE public.daycare_enrolments SET end_date = p_end_date,
      notice_given_at = COALESCE(p_notice_date, notice_given_at, CURRENT_DATE),
      end_reason = COALESCE(NULLIF(p_reason,''), end_reason), updated_at = now()
     WHERE id = e.id;
  END IF;

  RETURN jsonb_build_object('preview', p_preview, 'end_date', p_end_date, 'refund_total', v_total, 'lines', v_out);
END; $$;

REVOKE ALL ON FUNCTION public.daycare_end_enrolment(uuid,date,date,text,boolean) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.daycare_end_enrolment(uuid,date,date,text,boolean) TO authenticated;
