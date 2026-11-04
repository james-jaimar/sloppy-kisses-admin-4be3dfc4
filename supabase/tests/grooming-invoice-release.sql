-- All fixture changes and scheduled release side effects roll back.
DO $$
DECLARE t uuid; c uuid; a uuid; b uuid; d uuid; i uuid; j uuid; grp uuid:=gen_random_uuid(); rd date; today date:=(now() AT TIME ZONE 'Africa/Johannesburg')::date;
BEGIN
 SELECT tenant_id,id INTO t,c FROM public.customers LIMIT 1;
 IF c IS NULL THEN RAISE EXCEPTION 'Release fixtures unavailable'; END IF;
 BEGIN
 UPDATE public.invoicing_settings SET grooming_invoice_release_mode='appointment_day' WHERE tenant_id=t;
 UPDATE public.grooming_workflow_settings SET require_payment_to_confirm=true,payment_hold_hours=48 WHERE tenant_id=t;
 IF public.grooming_invoice_release_day(t,((today+20)::text||' 09:00+02')::timestamptz)<>today+20 THEN RAISE EXCEPTION 'Appointment-day policy'; END IF;
 INSERT INTO public.bookings(tenant_id,customer_id,booking_number,service_type,status,start_at,end_at,booking_group_id,suppress_initial_emails)
 VALUES(t,c,'TEST-RELEASE-'||gen_random_uuid(),'grooming_inhouse','confirmed',((today+20)::text||' 09:00+02')::timestamptz,((today+20)::text||' 10:00+02')::timestamptz,grp,true) RETURNING id INTO a;
 i:=public.ensure_booking_invoice(a);
 IF (SELECT status FROM public.invoices WHERE id=i)<>'draft' OR (SELECT scheduled_release_date FROM public.invoices WHERE id=i)<>today+20 THEN RAISE EXCEPTION 'Future invoice must remain scheduled draft'; END IF;
 IF (SELECT payment_hold_expires_at FROM public.bookings WHERE id=a) IS NOT NULL THEN RAISE EXCEPTION 'Future booking must not have early payment hold'; END IF;
 IF public.ensure_booking_invoice(a)<>i THEN RAISE EXCEPTION 'Duplicate invoice on retry'; END IF;
 INSERT INTO public.bookings(tenant_id,customer_id,booking_number,service_type,status,start_at,end_at,booking_group_id,suppress_initial_emails)
 VALUES(t,c,'TEST-RELEASE-'||gen_random_uuid(),'grooming_inhouse','confirmed',((today+20)::text||' 10:00+02')::timestamptz,((today+20)::text||' 11:00+02')::timestamptz,grp,true) RETURNING id INTO b;
 IF public.ensure_booking_invoice(b)<>i THEN RAISE EXCEPTION 'Same visit must share invoice'; END IF;
 INSERT INTO public.bookings(tenant_id,customer_id,booking_number,service_type,status,start_at,end_at,booking_group_id,suppress_initial_emails)
 VALUES(t,c,'TEST-RELEASE-'||gen_random_uuid(),'grooming_inhouse','confirmed',((today+27)::text||' 09:00+02')::timestamptz,((today+27)::text||' 10:00+02')::timestamptz,grp,true) RETURNING id INTO d;
 j:=public.ensure_booking_invoice(d);
 IF j=i THEN RAISE EXCEPTION 'Repeated days require separate invoices'; END IF;
 INSERT INTO public.invoice_items(tenant_id,invoice_id,booking_id,description,quantity,unit_price,line_total) VALUES(t,i,a,'Test groom',1,100,100);
 UPDATE public.invoices SET scheduled_release_date=today WHERE id=i;
 PERFORM public.release_due_grooming_invoices(); PERFORM public.release_due_grooming_invoices();
 IF (SELECT status FROM public.invoices WHERE id=i)<>'issued' THEN RAISE EXCEPTION 'Due invoice must issue'; END IF;
 IF (SELECT count(*) FROM public.notification_events WHERE invoice_id=i AND payload->>'grooming_scheduled_release'='true')<>1 THEN RAISE EXCEPTION 'Release retry duplicated notification'; END IF;
 IF (SELECT status FROM public.bookings WHERE id=a)<>'pending_payment' OR (SELECT payment_hold_expires_at FROM public.bookings WHERE id=a) IS NULL THEN RAISE EXCEPTION 'Released unpaid visit requires configured hold'; END IF;
 UPDATE public.bookings SET start_at=((today+30)::text||' 09:00+02')::timestamptz,end_at=((today+30)::text||' 10:00+02')::timestamptz WHERE id=d;
 IF (SELECT scheduled_release_date FROM public.invoices WHERE id=j)<>today+30 THEN RAISE EXCEPTION 'Reschedule must update release'; END IF;
 UPDATE public.bookings SET status='cancelled',cancellation_fee_waived=true WHERE id=d;
 UPDATE public.invoices SET scheduled_release_date=today WHERE id=j AND status='draft';
 PERFORM public.release_due_grooming_invoices();
 IF (SELECT status FROM public.invoices WHERE id=j)='issued' THEN RAISE EXCEPTION 'Cancelled appointment must not release'; END IF;
 UPDATE public.invoicing_settings SET grooming_invoice_release_mode='days_before',grooming_invoice_lead_days=3 WHERE tenant_id=t;
 IF public.grooming_invoice_release_day(t,((today+20)::text||' 09:00+02')::timestamptz)<>today+17 THEN RAISE EXCEPTION 'Three-day lead'; END IF;
 UPDATE public.invoicing_settings SET grooming_invoice_release_mode='at_booking' WHERE tenant_id=t;
 IF public.grooming_invoice_release_day(t,((today+20)::text||' 09:00+02')::timestamptz)<>today THEN RAISE EXCEPTION 'At-booking policy'; END IF;
 RAISE EXCEPTION USING ERRCODE='P0002',MESSAGE='RELEASE_TEST_ROLLBACK';
 EXCEPTION WHEN no_data_found THEN IF SQLERRM<>'RELEASE_TEST_ROLLBACK' THEN RAISE; END IF; END;
END $$;