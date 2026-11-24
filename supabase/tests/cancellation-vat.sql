-- Rollback-only cancellation regressions; no fixtures, queued messages or settings survive.
DO $$
DECLARE
 t uuid; c uuid; b uuid; i uuid; cn uuid; q jsonb; n integer;
 scenario text; service public.service_type; paid numeric; applied numeric;
BEGIN
 SELECT tenant_id,customer_id INTO t,c FROM public.invoices WHERE invoice_number='INV-70007';
 IF c IS NULL THEN RAISE EXCEPTION 'Cancellation VAT fixture customer unavailable'; END IF;
 BEGIN
  UPDATE public.grooming_workflow_settings SET cancellation_fee_pct=100,cancellation_notice_hours=24 WHERE tenant_id=t;
  UPDATE public.policy_settings SET hotel_deposit_percent=50,hotel_cancellation_cutoff_days=30 WHERE tenant_id=t;
  FOREACH scenario IN ARRAY ARRAY['inhouse_full','mobile_paid','hotel_half','grooming_fee','shared_draft'] LOOP
   service:=CASE WHEN scenario='mobile_paid' THEN 'grooming_mobile'::public.service_type
                 WHEN scenario='hotel_half' THEN 'hotel_dog'::public.service_type
                 ELSE 'grooming_inhouse'::public.service_type END;
   INSERT INTO public.bookings(tenant_id,customer_id,booking_number,service_type,status,start_at,end_at,start_date,end_date,suppress_initial_emails,closure_override)
   VALUES(t,c,'TEST-CANCEL-VAT-'||gen_random_uuid(),service,'draft',now()+interval '12 hours',now()+interval '13 hours',current_date,current_date,true,true)
   RETURNING id INTO b;
   INSERT INTO public.invoices(tenant_id,customer_id,invoice_number,status)
   VALUES(t,c,'TEST-CANCEL-VAT-'||gen_random_uuid(),'draft') RETURNING id INTO i;
   INSERT INTO public.invoice_items(tenant_id,invoice_id,booking_id,description,quantity,unit_price,line_total,vat_rate,vat_inclusive)
   VALUES(t,i,b,'Cancellation VAT regression',1,545,545,15,true);
   q:=public.booking_cancellation_quote(b);
   IF (q->>'base')::numeric<>545 THEN RAISE EXCEPTION '%: cancellation base must include R71.09 VAT',scenario; END IF;
   IF scenario='hotel_half' AND (q->>'amount')::numeric<>272.50 THEN RAISE EXCEPTION 'Hotel retains 50%% of R545 including VAT'; END IF;
   IF scenario='grooming_fee' AND (q->>'amount')::numeric<>545 THEN RAISE EXCEPTION 'Inside 24 hours grooming retains R545 including VAT'; END IF;
   IF scenario='shared_draft' THEN
    INSERT INTO public.invoice_items(tenant_id,invoice_id,description,quantity,unit_price,line_total,vat_rate,vat_inclusive)
    VALUES(t,i,'Unrelated shared-invoice service',1,115,115,15,true);
    UPDATE public.bookings SET status='cancelled',cancellation_fee_waived=true WHERE id=b;
    IF NOT EXISTS(SELECT 1 FROM public.invoices WHERE id=i AND subtotal=100 AND tax_total=15 AND total=115 AND balance_due=115) THEN
     RAISE EXCEPTION 'Draft cancellation must retain unrelated R100 plus R15 VAT';
    END IF;
   ELSE
    paid:=CASE WHEN scenario='mobile_paid' THEN 100 ELSE 0 END;
    UPDATE public.invoices SET status=CASE WHEN paid>0 THEN 'part_paid'::public.billing_status ELSE 'issued'::public.billing_status END,amount_paid=paid,balance_due=545-paid WHERE id=i;
    UPDATE public.bookings SET status='cancelled',cancellation_fee_waived=(scenario IN ('inhouse_full','mobile_paid')) WHERE id=b;
    SELECT id INTO cn FROM public.credit_notes WHERE invoice_id=i;
    IF scenario='grooming_fee' THEN
     IF cn IS NOT NULL OR (SELECT balance_due FROM public.invoices WHERE id=i)<>545 THEN RAISE EXCEPTION '100%% fee must not create a credit'; END IF;
    ELSE
     IF cn IS NULL THEN RAISE EXCEPTION '%: credit note missing',scenario; END IF;
     IF (SELECT total FROM public.credit_notes WHERE id=cn)<>CASE WHEN scenario='hotel_half' THEN 272.50 ELSE 545 END THEN
      RAISE EXCEPTION '%: wrong VAT-inclusive credit',scenario;
     END IF;
     applied:=CASE WHEN scenario='hotel_half' THEN 272.50 ELSE 545-paid END;
     IF (SELECT sum(amount) FROM public.credit_note_applications WHERE credit_note_id=cn)<>applied THEN RAISE EXCEPTION '%: wrong applied credit',scenario; END IF;
     IF (SELECT balance_due FROM public.invoices WHERE id=i)<>545-paid-applied THEN RAISE EXCEPTION '%: wrong remaining invoice balance',scenario; END IF;
     IF scenario='mobile_paid' AND (SELECT balance FROM public.credit_notes WHERE id=cn)<>100 THEN RAISE EXCEPTION 'Paid R100 must remain available as credit, not cash'; END IF;
     IF NOT EXISTS(SELECT 1 FROM public.invoices WHERE id=i AND subtotal=473.91 AND tax_total=71.09 AND total=545 AND amount_paid=paid) THEN RAISE EXCEPTION 'Issued invoice values must not change'; END IF;
     SELECT count(*) INTO n FROM public.credit_notes WHERE invoice_id=i;
     PERFORM public.apply_cancellation_fee(b,scenario IN ('inhouse_full','mobile_paid'));
     IF (SELECT count(*) FROM public.credit_notes WHERE invoice_id=i)<>n THEN RAISE EXCEPTION 'Retry duplicated credit note'; END IF;
    END IF;
   END IF;
  END LOOP;
  RAISE EXCEPTION USING ERRCODE='P0002',MESSAGE='CANCELLATION_VAT_TEST_ROLLBACK';
 EXCEPTION WHEN no_data_found THEN
  IF SQLERRM<>'CANCELLATION_VAT_TEST_ROLLBACK' THEN RAISE; END IF;
 END;
END $$;