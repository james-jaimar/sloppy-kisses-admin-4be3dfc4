DO $sweep$
DECLARE d text;
BEGIN
 d:=pg_get_functiondef('public.daycare_end_enrolment(uuid,date,date,text,boolean)'::regprocedure);
 IF strpos(d,'v_amt := ROUND(r.line_total * v_unused / v_all, 2);')=0 THEN RAISE EXCEPTION 'Unexpected daycare ending definition'; END IF;
 d:=replace(d,'ii.id AS item_id, ii.line_total, ii.description','ii.id AS item_id, ii.line_total, ii.vat_amount, ii.quantity, ii.unit_price, ii.description');
 d:=replace(d,'v_amt := ROUND(r.line_total * v_unused / v_all, 2);','v_amt := ROUND((r.line_total + COALESCE(r.vat_amount,0)) * v_unused / v_all, 2);');
 d:=replace(d,'unit_price = line_total - v_amt, line_total = line_total - v_amt','unit_price = ROUND(r.unit_price * (v_all - v_unused)::numeric / v_all, 2)');
 -- Invoice-item triggers already recompute net, VAT and gross totals after draft reductions.
 d:=regexp_replace(d,'      UPDATE public.invoices i SET[\s\S]*?WHERE i.id = r.invoice_id;','', 'g');
 EXECUTE d;
 d:=pg_get_functiondef('public._strip_transport_leg_lines(uuid)'::regprocedure);
 d:=regexp_replace(d,'    UPDATE public.invoices i SET[\s\S]*?WHERE i.id = r.id;','', 'g');
 EXECUTE d;
 d:=pg_get_functiondef('public.apply_cancellation_fee(uuid,boolean,text)'::regprocedure);
 d:=replace(d,'sort_order, source_type, source_id
    ) VALUES (','sort_order, source_type, source_id, vat_inclusive
    ) VALUES (');
 d:=replace(d,'1, v_fee, v_fee, 1, ''cancellation_fee'', p_booking_id','1, v_fee, v_fee, 1, ''cancellation_fee'', p_booking_id, true');
 EXECUTE d;
 d:=pg_get_functiondef('public.recompute_invoice_payments(uuid)'::regprocedure);
 d:=replace(d,'v_paid numeric(12,2);','v_paid numeric(12,2);
  v_credit numeric(12,2);');
 d:=replace(d,'  UPDATE public.invoices i SET','  SELECT COALESCE(SUM(amount),0) INTO v_credit FROM public.credit_note_applications WHERE invoice_id=p_invoice_id;
  UPDATE public.invoices i SET');
 d:=replace(d,'GREATEST(i.total - v_paid, 0)','GREATEST(i.total - v_paid - v_credit, 0)');
 d:=replace(d,'WHEN v_paid >= i.total - 0.005','WHEN v_paid + v_credit >= i.total - 0.005');
 d:=replace(d,'WHEN v_paid > 0 THEN','WHEN v_paid > 0 OR v_credit > 0 THEN');
 EXECUTE d;
END;
$sweep$;