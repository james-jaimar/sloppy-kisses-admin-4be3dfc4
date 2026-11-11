-- Every fixture and notification rolls back; no email dispatcher runs here.
DO $$
DECLARE t uuid; c uuid; i uuid; p uuid; loc uuid; n integer;
BEGIN
 SELECT tenant_id,id INTO t,c FROM public.customers LIMIT 1;
 SELECT id INTO p FROM public.products WHERE tenant_id=t LIMIT 1;
 SELECT id INTO loc FROM public.stock_locations WHERE tenant_id=t LIMIT 1;
 IF c IS NULL OR p IS NULL OR loc IS NULL THEN RAISE EXCEPTION 'Receipt fixtures unavailable'; END IF;
 BEGIN
 UPDATE public.customers SET email='pos-receipt-test@example.invalid',notify_email=true WHERE id=c;
 INSERT INTO public.retail_settings(tenant_id,auto_email_paid_receipt) VALUES(t,true) ON CONFLICT(tenant_id) DO UPDATE SET auto_email_paid_receipt=true;
 INSERT INTO public.invoices(tenant_id,customer_id,invoice_number,status,total,subtotal,balance_due) VALUES(t,c,'TEST-POS-'||gen_random_uuid(),'issued',1017,1017,1017) RETURNING id INTO i;
 INSERT INTO public.stock_movements(tenant_id,product_id,location_id,qty_delta,reason,ref_type,ref_id) VALUES(t,p,loc,-1,'sale','invoice',i);
 UPDATE public.invoices SET amount_paid=100,balance_due=917,status='part_paid' WHERE id=i;
 IF EXISTS(SELECT 1 FROM public.notification_events WHERE invoice_id=i AND event_type='invoice_paid') THEN RAISE EXCEPTION 'Partial payment must not send paid receipt'; END IF;
 UPDATE public.invoices SET amount_paid=1017,balance_due=0,status='paid' WHERE id=i;
 SELECT count(*) INTO n FROM public.notification_events WHERE invoice_id=i AND event_type='invoice_paid' AND status='pending' AND payload->>'pos_paid_receipt'='true';
 IF n<>1 THEN RAISE EXCEPTION 'Full payment must queue exactly one receipt'; END IF;
 UPDATE public.invoices SET status='part_paid' WHERE id=i;
 UPDATE public.invoices SET status='paid' WHERE id=i;
 IF (SELECT count(*) FROM public.notification_events WHERE invoice_id=i AND event_type='invoice_paid')<>1 THEN RAISE EXCEPTION 'Repeated paid transitions must not duplicate receipt'; END IF;
 UPDATE public.customers SET notify_email=false WHERE id=c;
 INSERT INTO public.invoices(tenant_id,customer_id,invoice_number,status,total,subtotal,balance_due) VALUES(t,c,'TEST-POS-OPTOUT-'||gen_random_uuid(),'issued',92,92,92) RETURNING id INTO i;
 INSERT INTO public.stock_movements(tenant_id,product_id,location_id,qty_delta,reason,ref_type,ref_id) VALUES(t,p,loc,-1,'sale','invoice',i);
 UPDATE public.invoices SET amount_paid=92,balance_due=0,status='paid' WHERE id=i;
 IF (SELECT count(*) FROM public.notification_events WHERE invoice_id=i AND status='skipped' AND error='Opted out (email)')<>1 THEN RAISE EXCEPTION 'Opt-out must skip the receipt'; END IF;
 UPDATE public.retail_settings SET auto_email_paid_receipt=false WHERE tenant_id=t;
 INSERT INTO public.invoices(tenant_id,customer_id,invoice_number,status,total,subtotal,balance_due) VALUES(t,c,'TEST-POS-OFF-'||gen_random_uuid(),'issued',92,92,92) RETURNING id INTO i;
 INSERT INTO public.stock_movements(tenant_id,product_id,location_id,qty_delta,reason,ref_type,ref_id) VALUES(t,p,loc,-1,'sale','invoice',i);
 UPDATE public.invoices SET amount_paid=92,balance_due=0,status='paid' WHERE id=i;
 IF EXISTS(SELECT 1 FROM public.notification_events WHERE invoice_id=i AND event_type='invoice_paid') THEN RAISE EXCEPTION 'Disabled setting must not queue receipt'; END IF;
 RAISE EXCEPTION USING ERRCODE='P0002',MESSAGE='POS_RECEIPT_TEST_ROLLBACK';
 EXCEPTION WHEN no_data_found THEN IF SQLERRM<>'POS_RECEIPT_TEST_ROLLBACK' THEN RAISE; END IF; END;
END $$;