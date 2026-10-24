-- Run with the database owner against a tenant with a five-day enrolled pet.
-- All test bookings, invoices and notification events are rolled back.
DO $$
DECLARE
  t uuid; pet uuid; customer uuid; pkg uuid; booking uuid;
  discount numeric; visit integer; test_day date := date '2026-11-02';
BEGIN
  SELECT e.tenant_id,e.pet_id,e.customer_id INTO t,pet,customer
  FROM public.daycare_enrolments e JOIN public.daycare_plans p ON p.id=e.daycare_plan_id
  WHERE e.active AND p.active AND p.days_per_week=5 AND p.free_grooms_per_month=1
    AND e.start_date<=test_day AND (e.end_date IS NULL OR e.end_date>=test_day)
  LIMIT 1;
  IF pet IS NULL THEN RAISE EXCEPTION 'A five-day enrolled pet is required'; END IF;
  SELECT id INTO pkg FROM public.grooming_packages
  WHERE tenant_id=t AND active AND package_type='full' LIMIT 1;
  IF pkg IS NULL THEN RAISE EXCEPTION 'A Full grooming package is required'; END IF;
  BEGIN
    FOR visit IN 0..1 LOOP
      INSERT INTO public.bookings(tenant_id,customer_id,booking_number,service_type,source,status,start_at,end_at,suppress_initial_emails)
      VALUES(t,customer,'TEST-'||gen_random_uuid(),'grooming_inhouse','staff_capture','draft',
        (test_day+visit*7)+time '10:00',(test_day+visit*7)+time '11:00',true) RETURNING id INTO booking;
      INSERT INTO public.booking_pets(tenant_id,booking_id,pet_id) VALUES(t,booking,pet);
      INSERT INTO public.grooming_booking_details(tenant_id,booking_id,grooming_mode,package_id)
      VALUES(t,booking,'inhouse',pkg);
      SELECT discount_pct INTO discount FROM public.invoice_items
      WHERE booking_id=booking AND description LIKE 'Grooming — %';
      IF visit=0 AND discount IS DISTINCT FROM 100 THEN
        RAISE EXCEPTION 'First monthly groom should have 100%% discount, got %',discount;
      ELSIF visit=1 AND (discount IS NULL OR discount=100) THEN
        RAISE EXCEPTION 'Second monthly groom must not be free';
      END IF;
    END LOOP;
    RAISE EXCEPTION USING ERRCODE='P0002',MESSAGE='TEST_PASSED_ROLLBACK';
  EXCEPTION WHEN no_data_found THEN
    IF SQLERRM<>'TEST_PASSED_ROLLBACK' THEN RAISE; END IF;
  END;
  BEGIN
    INSERT INTO public.booking_requests(tenant_id,customer_id,service_type,source,kind,status,preferred_start_at)
    VALUES(t,customer,'daycare_assessment','staff_capture','new','pending_review','2026-10-24 08:00+02');
    RAISE EXCEPTION 'Weekend assessment incorrectly allowed';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%Monday to Friday%' THEN RAISE; END IF;
  END;
END $$;