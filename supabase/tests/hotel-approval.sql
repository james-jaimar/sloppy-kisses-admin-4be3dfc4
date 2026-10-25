-- Database-owner regression; every test row is rolled back inside the subtransaction.
DO $$
DECLARE t uuid; c uuid; p uuid; actor uuid; b uuid; rate text; eid uuid; inv uuid; total numeric; checklist jsonb; token uuid; accepted jsonb;
BEGIN
 IF public.hotel_required_percent(date '2026-11-25',date '2026-10-25',30,50,NULL)<>50 THEN RAISE EXCEPTION '31 days requires 50 percent'; END IF;
 IF public.hotel_required_percent(date '2026-11-24',date '2026-10-25',30,50,NULL)<>100 THEN RAISE EXCEPTION '30 days requires 100 percent'; END IF;
 IF public.hotel_required_percent(date '2026-11-23',date '2026-10-25',30,50,25)<>25 THEN RAISE EXCEPTION 'Override must win'; END IF;
 SELECT pets.tenant_id,pets.customer_id,pets.id,rc.accommodation_type INTO t,c,p,rate FROM public.pets JOIN public.hotel_rate_cards rc ON rc.tenant_id=pets.tenant_id AND rc.species=pets.species::text AND rc.active WHERE pets.species='dog' LIMIT 1;
 IF p IS NULL THEN RAISE EXCEPTION 'Need a dog and configured hotel rate'; END IF;
 SELECT auth_user_id INTO actor FROM public.profiles WHERE user_type='platform' AND auth_user_id IS NOT NULL LIMIT 1;
 IF actor IS NULL THEN RAISE EXCEPTION 'Need an authorized staff actor'; END IF;
 PERFORM set_config('request.jwt.claim.sub',actor::text,true);
 IF NOT public.user_has_permission(t,'bookings.edit') OR NOT public.user_has_permission(t,'payments.create') THEN RAISE EXCEPTION 'Actor lacks required permissions'; END IF;
 BEGIN
  INSERT INTO public.bookings(tenant_id,customer_id,booking_number,service_type,status,source,start_at,end_at,start_date,end_date,suppress_initial_emails)
  VALUES(t,c,'TEST-HOTEL-'||gen_random_uuid(),'hotel_dog','draft','staff_capture','2027-02-01 09:00+02','2027-02-08 09:00+02','2027-02-01','2027-02-08',true) RETURNING id INTO b;
  INSERT INTO public.booking_pets(tenant_id,booking_id,pet_id,accommodation_type) VALUES(t,b,p,rate);
  INSERT INTO public.hotel_booking_details(tenant_id,booking_id,accommodation_type) VALUES(t,b,rate);
  IF EXISTS(SELECT 1 FROM public.invoices WHERE booking_id=b) OR (SELECT invoice_id FROM public.bookings WHERE id=b) IS NOT NULL THEN RAISE EXCEPTION 'Hotel detail creation must not create invoice'; END IF;
  eid:=public.hotel_review_action(b,'estimate','{}');
  SELECT public_token INTO token FROM public.estimates WHERE id=eid;
  IF token IS NULL OR (SELECT total FROM public.estimates WHERE id=eid)<=0 THEN RAISE EXCEPTION 'Basic dates/pet quote must have a public token and price without intake'; END IF;
  accepted:=public.accept_public_quote(token);
  IF NOT COALESCE((accepted->>'ok')::boolean,false) OR (accepted->>'booking_id')::uuid<>b THEN RAISE EXCEPTION 'Public acceptance must reuse the existing booking'; END IF;
  IF (SELECT status FROM public.estimates WHERE id=eid)<>'accepted' OR (SELECT accepted_at FROM public.estimates WHERE id=eid) IS NULL THEN RAISE EXCEPTION 'Linked quote acceptance must be recorded'; END IF;
  IF (SELECT status FROM public.bookings WHERE id=b)<>'needs_info' THEN RAISE EXCEPTION 'Accepted hotel quote must enter information gathering, not confirmation'; END IF;
  IF EXISTS(SELECT 1 FROM public.invoices WHERE booking_id=b) OR (SELECT invoice_id FROM public.bookings WHERE id=b) IS NOT NULL THEN RAISE EXCEPTION 'Quote acceptance must not issue an invoice'; END IF;
  IF (public.accept_public_quote(token)->>'booking_id')::uuid<>b THEN RAISE EXCEPTION 'Repeat acceptance must reuse booking'; END IF;
  SELECT jsonb_object_agg(x->>'code',true) INTO checklist FROM public.hotel_workflow_settings w CROSS JOIN LATERAL jsonb_array_elements(w.approval_checklist) x WHERE w.tenant_id=t;
  PERFORM public.hotel_review_action(b,'save',jsonb_build_object('checklist',checklist));
  IF (SELECT invoice_id FROM public.bookings WHERE id=b) IS NOT NULL THEN RAISE EXCEPTION 'Saving intake must not create invoice'; END IF;
  inv:=public.hotel_review_action(b,'confirm','{}');
  IF inv IS NULL OR NOT EXISTS(SELECT 1 FROM public.invoices i WHERE i.id=inv AND i.total>0 AND i.status='issued') THEN RAISE EXCEPTION 'Confirming must issue a priced invoice'; END IF;
  SELECT i.total INTO total FROM public.invoices i WHERE i.id=inv;
  IF (SELECT deposit_due FROM public.invoices WHERE id=inv)<>ROUND(total*0.5,2) THEN RAISE EXCEPTION 'Stay more than 30 days out must ask 50 percent'; END IF;
  IF EXISTS(SELECT 1 FROM public.payment_allocations WHERE invoice_id=inv) THEN RAISE EXCEPTION 'Confirming must not need a payment'; END IF;
  IF (SELECT status FROM public.bookings WHERE id=b)<>'confirmed' THEN RAISE EXCEPTION 'Confirmed stay must be confirmed'; END IF;
  IF public.hotel_review_action(b,'confirm','{}')<>inv THEN RAISE EXCEPTION 'Confirm twice must reuse invoice'; END IF;
  RAISE EXCEPTION USING ERRCODE='P0002',MESSAGE='HOTEL_TEST_PASSED_ROLLBACK';
 EXCEPTION WHEN no_data_found THEN IF SQLERRM<>'HOTEL_TEST_PASSED_ROLLBACK' THEN RAISE; END IF; END;
END $$;