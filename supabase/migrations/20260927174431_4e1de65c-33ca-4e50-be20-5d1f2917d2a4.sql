CREATE OR REPLACE FUNCTION public.apply_cancellation_fee(p_booking_id uuid, p_waive boolean DEFAULT false, p_reason text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  b public.bookings;
  q jsonb;
  v_fee numeric(12,2) := 0;
  v_inv uuid;
  v_status text;
  v_remaining int;
  v_note text;
  v_reason text;
  v_issued_value numeric(12,2) := 0;
  v_fee_left numeric(12,2);
  v_credit_total numeric(12,2) := 0;
  v_cn_numbers text[] := '{}';
  r record;
  v_amt numeric(12,2);
  v_cn uuid;
  v_num text;
  v_bal numeric(12,2);
  v_apply numeric(12,2);
BEGIN
  SELECT * INTO b FROM public.bookings WHERE id = p_booking_id;
  IF b.id IS NULL THEN RETURN NULL; END IF;

  q := public.booking_cancellation_quote(p_booking_id);
  v_fee := CASE WHEN p_waive THEN 0 ELSE COALESCE((q->>'amount')::numeric, 0) END;
  v_reason := NULLIF(trim(COALESCE(p_reason, b.cancellation_reason, '')), '');

  -- Value of this booking already on ISSUED (non-draft, non-cancelled) invoices.
  SELECT COALESCE(SUM(ii.line_total),0) INTO v_issued_value
    FROM public.invoice_items ii JOIN public.invoices i ON i.id = ii.invoice_id
   WHERE ii.booking_id = p_booking_id
     AND i.status::text NOT IN ('draft','cancelled')
     AND COALESCE(ii.source_type,'') <> 'cancellation_fee';

  IF v_issued_value > 0 THEN
    -- Issued invoices are never edited: reverse with a credit note, keeping any fee.
    v_fee_left := LEAST(v_fee, v_issued_value);
    FOR r IN
      SELECT i.id AS invoice_id, i.invoice_number, i.customer_id,
             SUM(ii.line_total)::numeric(12,2) AS booking_total
        FROM public.invoice_items ii JOIN public.invoices i ON i.id = ii.invoice_id
       WHERE ii.booking_id = p_booking_id
         AND i.status::text NOT IN ('draft','cancelled')
         AND COALESCE(ii.source_type,'') <> 'cancellation_fee'
       GROUP BY i.id, i.invoice_number, i.customer_id, i.created_at
       ORDER BY i.created_at DESC
    LOOP
      -- The fee is retained against the earliest invoices (e.g. the hotel deposit),
      -- so credit the latest invoices first.
      v_amt := r.booking_total;
      IF v_issued_value - r.booking_total < v_fee_left THEN
        v_amt := GREATEST(r.booking_total - (v_fee_left - GREATEST(v_issued_value - r.booking_total, 0)), 0);
      END IF;
      v_issued_value := v_issued_value - r.booking_total;
      IF v_amt <= 0 THEN CONTINUE; END IF;

      IF EXISTS (SELECT 1 FROM public.credit_note_items ci JOIN public.credit_notes cn ON cn.id = ci.credit_note_id
                  WHERE ci.item_code = 'booking_cancel:' || p_booking_id || ':' || r.invoice_id
                    AND cn.status <> 'cancelled') THEN
        CONTINUE;
      END IF;

      v_num := public.next_credit_note_number(b.tenant_id);
      INSERT INTO public.credit_notes(tenant_id, credit_note_number, customer_id, invoice_id, status, reason, notes, created_by)
      VALUES (b.tenant_id, v_num, COALESCE(r.customer_id, b.customer_id), r.invoice_id, 'draft',
        'Booking cancelled' || COALESCE(' — ' || v_reason, ''),
        'Booking ' || COALESCE(b.booking_number,'') || ' cancelled on ' || to_char(now(),'DD Mon YYYY')
          || CASE WHEN v_fee > 0 THEN '. Cancellation fee of R' || to_char(v_fee,'FM999999990.00') || ' retained.'
                  WHEN p_waive THEN '. Cancellation fee waived.' ELSE '.' END,
        auth.uid())
      RETURNING id INTO v_cn;
      INSERT INTO public.credit_note_items(tenant_id, credit_note_id, description, quantity, unit_price, line_total, sort_order, item_code)
      VALUES (b.tenant_id, v_cn,
        'Cancelled booking ' || COALESCE(b.booking_number,'') || ' (invoice ' || COALESCE(r.invoice_number,'') || ')'
          || CASE WHEN v_amt < r.booking_total THEN ' — less cancellation fee' ELSE '' END,
        1, v_amt, v_amt, 1, 'booking_cancel:' || p_booking_id || ':' || r.invoice_id);
      UPDATE public.credit_notes SET status = 'issued', issue_date = CURRENT_DATE WHERE id = v_cn;

      SELECT balance_due INTO v_bal FROM public.invoices WHERE id = r.invoice_id;
      v_apply := LEAST(v_amt, GREATEST(COALESCE(v_bal,0),0));
      IF v_apply > 0 THEN
        INSERT INTO public.credit_note_applications(tenant_id, credit_note_id, invoice_id, amount)
        VALUES (b.tenant_id, v_cn, r.invoice_id, v_apply);
      END IF;
      v_credit_total := v_credit_total + v_amt;
      v_cn_numbers := v_cn_numbers || v_num;
    END LOOP;

    v_note := CASE
      WHEN v_credit_total > 0 THEN 'Credit note ' || array_to_string(v_cn_numbers, ', ') || ' issued for R' || to_char(v_credit_total,'FM999999990.00')
      ELSE 'No credit issued' END
      || CASE WHEN v_fee > 0 THEN '; cancellation fee of R' || to_char(v_fee,'FM999999990.00') || ' retained.'
              WHEN p_waive THEN '; cancellation fee waived.' ELSE '.' END;

    UPDATE public.bookings
       SET cancellation_fee_zar = v_fee,
           cancellation_fee_note = v_note || COALESCE(' ' || v_reason, ''),
           updated_at = now()
     WHERE id = p_booking_id;
    RETURN jsonb_build_object('fee', v_fee, 'invoice_locked', true, 'credit_total', v_credit_total,
      'credit_notes', to_jsonb(v_cn_numbers), 'note', v_note, 'quote', q);
  END IF;

  -- Draft path: the invoice hasn't been issued yet, so it can still be edited.
  SELECT i.id, i.status::text INTO v_inv, v_status
    FROM public.invoice_items ii JOIN public.invoices i ON i.id = ii.invoice_id
   WHERE ii.booking_id = p_booking_id AND i.status::text = 'draft'
   LIMIT 1;
  IF v_inv IS NULL AND b.invoice_id IS NOT NULL THEN
    SELECT id, status::text INTO v_inv, v_status FROM public.invoices WHERE id = b.invoice_id AND status::text = 'draft';
  END IF;

  IF v_inv IS NOT NULL THEN
    DELETE FROM public.invoice_items
     WHERE invoice_id = v_inv AND booking_id = p_booking_id
       AND COALESCE(source_type,'') <> 'cancellation_fee';
  END IF;

  IF v_fee > 0 THEN
    IF v_inv IS NULL THEN
      v_inv := public.ensure_booking_invoice(p_booking_id);
    END IF;
    DELETE FROM public.invoice_items WHERE source_type = 'cancellation_fee' AND source_id = p_booking_id;
    INSERT INTO public.invoice_items(
      tenant_id, invoice_id, booking_id, description, quantity, unit_price, line_total,
      sort_order, source_type, source_id
    ) VALUES (
      b.tenant_id, v_inv, p_booking_id,
      'Cancellation fee — booking ' || COALESCE(b.booking_number,'')
        || ' (' || (q->>'percent') || '% of ' || to_char(COALESCE((q->>'base')::numeric,0), 'FM999999990.00') || ')',
      1, v_fee, v_fee, 1, 'cancellation_fee', p_booking_id
    );
    v_note := 'Cancellation fee of R' || to_char(v_fee, 'FM999999990.00') || ' charged.';
  ELSE
    v_note := CASE WHEN p_waive THEN 'Cancellation fee waived.' ELSE 'Cancelled outside the notice window — no fee.' END;
  END IF;

  IF v_inv IS NOT NULL THEN
    SELECT count(*) INTO v_remaining FROM public.invoice_items WHERE invoice_id = v_inv;
    IF v_remaining = 0 THEN
      UPDATE public.invoices
         SET status = 'cancelled', subtotal = 0, total = 0, balance_due = 0, updated_at = now()
       WHERE id = v_inv AND status::text = 'draft';
    ELSE
      UPDATE public.invoices i SET
        subtotal = (SELECT COALESCE(SUM(line_total),0) FROM public.invoice_items WHERE invoice_id = i.id),
        total    = (SELECT COALESCE(SUM(line_total),0) FROM public.invoice_items WHERE invoice_id = i.id),
        balance_due = (SELECT COALESCE(SUM(line_total),0) FROM public.invoice_items WHERE invoice_id = i.id) - i.amount_paid,
        updated_at = now()
      WHERE i.id = v_inv;
    END IF;
  END IF;

  UPDATE public.bookings
     SET cancellation_fee_zar = v_fee,
         cancellation_fee_note = COALESCE(v_note,'') || COALESCE(' ' || v_reason, ''),
         updated_at = now()
   WHERE id = p_booking_id;

  RETURN jsonb_build_object('fee', v_fee, 'invoice_id', v_inv, 'invoice_locked', false, 'note', v_note, 'quote', q);
END;
$function$;

REVOKE ALL ON FUNCTION public.apply_cancellation_fee(uuid, boolean, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.apply_cancellation_fee(uuid, boolean, text) TO authenticated, service_role;