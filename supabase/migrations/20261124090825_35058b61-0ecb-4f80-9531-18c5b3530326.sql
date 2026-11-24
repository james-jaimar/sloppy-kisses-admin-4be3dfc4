DO $$ DECLARE d text; BEGIN
 d:=pg_get_functiondef('public._strip_auto_invoice_lines(text,uuid)'::regprocedure);
 IF strpos(d,'SUM(line_total)')=0 THEN RAISE EXCEPTION 'Unexpected source-line removal definition'; END IF;
 d:=replace(d,'total       = (SELECT COALESCE(SUM(line_total),0)','tax_total   = (SELECT COALESCE(SUM(vat_amount),0) FROM public.invoice_items WHERE invoice_id = v_inv.id),
        total       = (SELECT COALESCE(SUM(line_total + COALESCE(vat_amount,0)),0)');
 d:=replace(d,'balance_due = (SELECT COALESCE(SUM(line_total),0)','balance_due = (SELECT COALESCE(SUM(line_total + COALESCE(vat_amount,0)),0)');
 EXECUTE d;
END $$;