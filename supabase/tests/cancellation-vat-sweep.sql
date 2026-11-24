-- All test invoices, enrolment edits and notifications are rolled back.
DO $$
DECLARE t uuid; c uuid; e uuid; actor uuid; b uuid; i uuid; cn uuid; q jsonb; mode text;
BEGIN
 SELECT tenant_id,customer_id,id INTO t,c,e FROM public.daycare_enrolments LIMIT 1;
 SELECT auth_user_id INTO actor FROM public.profiles WHERE user_type='platform' AND auth_user_id IS NOT NULL LIMIT 1;
 IF e IS NULL OR actor IS NULL THEN RAISE EXCEPTION 'Authorized daycare VAT fixtures unavailable'; END IF;
 BEGIN
  PERFORM set_config('request.jwt.claim.sub',actor::text,true);
  UPDATE public.daycare_enrolments SET start_date='2026-11-01',selected_days=ARRAY['mon','tue','wed','thu','fri'] WHERE id=e;
  FOREACH mode IN ARRAY ARRAY['issued','draft'] LOOP
   INSERT INTO public.invoices(tenant_id,customer_id,invoice_number,status,billing_period_start,billing_period_end)
   VALUES(t,c,'TEST-SWEEP-VAT-'||gen_random_uuid(),'draft','2026-11-01','2026-11-30') RETURNING id INTO i;
   INSERT INTO public.invoice_items(tenant_id,invoice_id,description,quantity,unit_price,line_total,vat_rate,vat_inclusive,source_type,source_id)
   VALUES(t,i,'Daycare VAT regression',1,2300,2300,15,true,'daycare_enrolment',e);
   IF mode='issued' THEN UPDATE public.invoices SET status='issued' WHERE id=i; END IF;
   q:=public.daycare_end_enrolment(e,'2026-11-13',NULL,NULL,true);
   IF (q->>'refund_total')::numeric<>1204.76 THEN RAISE EXCEPTION '11 of 21 unused days must credit R1204.76 including VAT'; END IF;
   PERFORM public.daycare_end_enrolment(e,'2026-11-13',NULL,NULL,false);
   IF mode='issued' THEN
    SELECT id INTO cn FROM public.credit_notes WHERE invoice_id=i;
    IF cn IS NULL OR (SELECT total FROM public.credit_notes WHERE id=cn)<>1204.76 THEN RAISE EXCEPTION 'Daycare credit omitted VAT'; END IF;
    PERFORM public.recompute_invoice_payments(i);
    IF (SELECT balance_due FROM public.invoices WHERE id=i)<>1095.24 THEN RAISE EXCEPTION 'Payment refresh must preserve applied R1204.76 credit'; END IF;
   ELSE
    IF NOT EXISTS(SELECT 1 FROM public.invoices WHERE id=i AND total=1095.24 AND subtotal=952.38 AND tax_total=142.86) THEN RAISE EXCEPTION 'Daycare draft must retain R1095.24 gross, not strip or double VAT'; END IF;
   END IF;
  END LOOP;
  FOREACH mode IN ARRAY ARRAY['transport','delete_source','draft_fee'] LOOP
   INSERT INTO public.bookings(tenant_id,customer_id,booking_number,service_type,status,start_at,end_at,start_date,end_date,suppress_initial_emails,closure_override)
   VALUES(t,c,'TEST-SWEEP-VAT-'||gen_random_uuid(),'grooming_inhouse','draft',now()+interval '12 hours',now()+interval '13 hours',current_date,current_date,true,true) RETURNING id INTO b;
   INSERT INTO public.invoices(tenant_id,customer_id,invoice_number,status) VALUES(t,c,'TEST-SWEEP-VAT-'||gen_random_uuid(),'draft') RETURNING id INTO i;
   INSERT INTO public.invoice_items(tenant_id,invoice_id,booking_id,description,quantity,unit_price,line_total,vat_rate,vat_inclusive,source_type,source_id)
   VALUES(t,i,b,'Removed charge',1,545,545,15,true,'test_source',b);
   IF mode='draft_fee' THEN
    UPDATE public.grooming_workflow_settings SET cancellation_fee_pct=100,cancellation_notice_hours=24 WHERE tenant_id=t;
    UPDATE public.invoicing_settings SET prices_include_vat=false WHERE tenant_id=t;
    UPDATE public.bookings SET status='cancelled' WHERE id=b;
    IF (SELECT total FROM public.invoices WHERE id=i)<>545 THEN RAISE EXCEPTION 'Draft R545 retained fee must not add VAT twice'; END IF;
   ELSE
    INSERT INTO public.invoice_items(tenant_id,invoice_id,description,quantity,unit_price,line_total,vat_rate,vat_inclusive)
    VALUES(t,i,'Unrelated service',1,115,115,15,true);
    IF mode='transport' THEN PERFORM public._strip_transport_leg_lines(b);
    ELSE PERFORM public._strip_auto_invoice_lines('test_source',b); END IF;
    IF NOT EXISTS(SELECT 1 FROM public.invoices WHERE id=i AND subtotal=100 AND tax_total=15 AND total=115 AND balance_due=115) THEN RAISE EXCEPTION '% must retain unrelated VAT',mode; END IF;
   END IF;
  END LOOP;
  RAISE EXCEPTION USING ERRCODE='P0002',MESSAGE='VAT_SWEEP_ROLLBACK';
 EXCEPTION WHEN no_data_found THEN IF SQLERRM<>'VAT_SWEEP_ROLLBACK' THEN RAISE; END IF;
 END;
END $$;