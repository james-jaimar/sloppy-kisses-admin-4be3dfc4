-- Database-owner regression; every test row is rolled back inside the subtransaction.
DO $$
DECLARE t uuid; c uuid; p uuid; actor uuid; b uuid; rate text; eid uuid; inv uuid; total numeric; checklist jsonb;
BEGIN
 IF public.hotel_required_percent(date '2026-11-25',date '2026-10-25',30,50,NULL)<>50 THEN RAISE EXCEPTION '31 days requires 50 percent'; END IF;
 IF public.hotel_required_percent(date '2026-11-24',date '2026-10-25',30,50,NULL)<>100 THEN RAISE EXCEPTION '30 days requires 100 percent'; END IF;
 IF public.hotel_required_percent(date '2026-11-23',date '2026-10-25',30,50,25)<>25 THEN RAISE EXCEPTION 'Override must win'; END IF;
 SELECT pets.tenant_id,pets.customer_id,pets.id,rc.accommodation_type INTO t,c,p,rate FROM public.pets JOIN public.hotel_rate_cards rc ON rc.tenant_id=pets.tenant_id AND rc.species=pets.species::text AND rc.active WHERE pets.species='dog' LIMIT 1;
 IF p IS NULL THEN RAISE EXCEPTION 'Need a dog and configured hotel rate'; END IF;
 SELECT pr.auth_user_id INTO actor FROM public.profiles pr JOIN public.tenant_users tu ON tu.profile_id=pr.id WHERE tu.tenant_id=t AND public.user_has_permission(t,'bookings.edit',pr.auth_user_id) LIMIT 1;
 -- Actor discovery is adapted to the installed permission signature by the test runner.
 IF actor IS NULL THEN RAISE EXCEPTION 'Need an authorized staff actor'; END IF;
 PERFORM set_config('request.jwt.claim.sub',actor::text,true);
 BEGIN
  INSERT INTO public.bookings(tenant_id,customer_id,booking_number,service_type,status,source,start_at,end_at,start_date,end_date,suppress_initial_emails)
  VALUES(t,c,'TEST-HOTEL-'||gen_random_uuid(),'hotel_dog','draft','staff_capture','2027-02-01 09:00+02','2027-02-08 09:00+02','2027-02-01','2027-02-08',true) RETURNING id INTO b;
  INSERT INTO public.booking_pets(tenant_id,booking_id,pet_id,accommodation_type) VALUES(t,b,p,rate);
  INSERT INTO public.hotel_booking_details(tenant_id,booking_id,accommodation_type) VALUES(t,b,rate);
  IF EXISTS(SELECT 1 FROM public.invoices WHERE booking_id=b) OR (SELECT invoice_id FROM public.bookings WHERE id=b) IS NOT NULL THEN RAISE EXCEPTION 'Hotel detail creation must not create invoice'; END IF;
  SELECT jsonb_object_agg(x->>'code',true) INTO checklist FROM public.hotel_workflow_settings w CROSS JOIN LATERAL jsonb_array_elements(w.approval_checklist) x WHERE w.tenant_id=t;
  PERFORM public.hotel_review_action(b,'save',jsonb_build_object('checklist',checklist));
  eid:=public.hotel_review_action(b,'approve','{}');
  IF (SELECT invoice_id FROM public.bookings WHERE id=b) IS NOT NULL THEN RAISE EXCEPTION 'Approval must not create invoice'; END IF;
  SELECT e.total INTO total FROM public.estimates e WHERE e.id=eid;
  IF total<=0 THEN RAISE EXCEPTION 'Pro forma must be priced'; END IF;
  inv:=public.hotel_review_action(b,'record_receipt',jsonb_build_object('amount',total/2,'method','eft','reference','TEST-CLEARED'));
  IF inv IS NULL OR NOT EXISTS(SELECT 1 FROM public.invoices WHERE id=inv AND total>0) THEN RAISE EXCEPTION 'Receipt must create priced invoice'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.payment_allocations WHERE invoice_id=inv AND amount=total/2) THEN RAISE EXCEPTION 'Receipt must allocate actual 50 percent'; END IF;
  IF (SELECT status FROM public.bookings WHERE id=b)<>'confirmed' THEN RAISE EXCEPTION 'Paid approved stay must confirm'; END IF;
  RAISE EXCEPTION USING ERRCODE='P0002',MESSAGE='HOTEL_TEST_PASSED_ROLLBACK';
 EXCEPTION WHEN no_data_found THEN IF SQLERRM<>'HOTEL_TEST_PASSED_ROLLBACK' THEN RAISE; END IF; END;
END $$;