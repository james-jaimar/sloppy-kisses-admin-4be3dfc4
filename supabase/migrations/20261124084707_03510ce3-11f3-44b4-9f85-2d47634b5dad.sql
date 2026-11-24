DO $migration$
DECLARE d text; revised text;
BEGIN
 d:=pg_get_functiondef('public.booking_cancellation_quote(uuid,timestamptz)'::regprocedure);
 IF strpos(d,'SUM(line_total)')=0 THEN RAISE EXCEPTION 'Unexpected cancellation quote definition'; END IF;
 revised:=replace(d,'SUM(line_total)','SUM(line_total + COALESCE(vat_amount,0))');
 EXECUTE revised;
 d:=pg_get_functiondef('public.apply_cancellation_fee(uuid,boolean,text)'::regprocedure);
 IF strpos(d,'SUM(ii.line_total)')=0 OR strpos(d,'total    = (SELECT COALESCE(SUM(line_total),0)')=0 THEN RAISE EXCEPTION 'Unexpected cancellation application definition'; END IF;
 revised:=replace(d,'SUM(ii.line_total)','SUM(ii.line_total + COALESCE(ii.vat_amount,0))');
 revised:=replace(revised,'total    = (SELECT COALESCE(SUM(line_total),0)','tax_total = (SELECT COALESCE(SUM(vat_amount),0) FROM public.invoice_items WHERE invoice_id = i.id),
        total    = (SELECT COALESCE(SUM(line_total + COALESCE(vat_amount,0)),0)');
 revised:=replace(revised,'balance_due = (SELECT COALESCE(SUM(line_total),0)','balance_due = (SELECT COALESCE(SUM(line_total + COALESCE(vat_amount,0)),0)');
 revised:=replace(revised,'SET status = ''cancelled'', subtotal = 0, total = 0, balance_due = 0','SET status = ''cancelled'', subtotal = 0, tax_total = 0, total = 0, balance_due = 0');
 EXECUTE revised;
END;
$migration$;