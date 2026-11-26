-- Database-owner regression. All fixtures and their side effects roll back.
DO $$
DECLARE h public.bookings; t uuid; c uuid; p uuid; pkg uuid; actor uuid; b uuid; b2 uuid; rid uuid; groom uuid; q uuid; inv uuid; base numeric; price numeric; n integer; setting_before boolean;
BEGIN
 SELECT * INTO h FROM public.bookings WHERE booking_number='BK00281';
 SELECT pet_id,package_id INTO p,pkg FROM public.hotel_grooming_requests WHERE hotel_booking_id=h.id LIMIT 1;
 SELECT auth_user_id INTO actor FROM public.profiles WHERE id=h.created_by;
 IF h.id IS NULL OR p IS NULL OR pkg IS NULL OR actor IS NULL THEN RAISE EXCEPTION 'Missing regression prerequisites'; END IF;
 t:=h.tenant_id; c:=h.customer_id;
 PERFORM set_config('request.jwt.claim.sub',actor::text,true);
 SELECT auto_invoice_grooming INTO setting_before FROM public.invoicing_settings WHERE tenant_id=t;
 BEGIN
  INSERT INTO public.bookings(tenant_id,customer_id,booking_number,service_type,status,source,start_at,end_at,start_date,end_date,suppress_initial_emails)
  VALUES(t,c,'TEST-HOTEL-GROOM-'||gen_random_uuid(),'hotel_dog','requested','staff_capture','2027-02-02 09:00+02','2027-02-09 09:00+02','2027-02-02','2027-02-09',true) RETURNING id INTO b;
  INSERT INTO public.booking_pets(tenant_id,booking_id,pet_id,accommodation_type) SELECT t,b,p,accommodation_type FROM public.booking_pets WHERE booking_id=h.id AND pet_id=p;
  INSERT INTO public.hotel_booking_details(tenant_id,booking_id,accommodation_type) SELECT t,b,accommodation_type FROM public.hotel_booking_details WHERE booking_id=h.id;
  q:=public.hotel_review_action(b,'estimate','{}');
  SELECT total INTO base FROM public.estimates WHERE id=q;
  INSERT INTO public.hotel_grooming_requests(tenant_id,hotel_booking_id,customer_id,pet_id,pet_name,window_start,window_end,status,package_id)
  VALUES(t,b,c,p,'Regression dog','2027-02-02','2027-02-09','pending',pkg) RETURNING id INTO rid;
  SELECT round(gp.price_zar*(1-w.checkout_groom_discount_pct/100),2) INTO price FROM public.grooming_packages gp JOIN public.hotel_workflow_settings w ON w.tenant_id=gp.tenant_id WHERE gp.id=pkg;
  IF (SELECT total FROM public.estimates WHERE id=q) IS DISTINCT FROM base+price THEN RAISE EXCEPTION 'Adding groom must automatically increase quote by configured hotel-discounted price'; END IF;
  groom:=public.schedule_hotel_groom(rid,'2027-02-09 09:00+02','2027-02-09 09:30+02',pkg,NULL,NULL);
  IF (SELECT parent_booking_id FROM public.bookings WHERE id=groom) IS DISTINCT FROM b THEN RAISE EXCEPTION 'Scheduled groom must link directly to hotel'; END IF;
  IF (SELECT invoice_id FROM public.bookings WHERE id=groom) IS NOT NULL OR public.ensure_booking_invoice(groom) IS NOT NULL THEN RAISE EXCEPTION 'Scheduling before confirmation must not create a separate invoice'; END IF;
  IF (SELECT total FROM public.estimates WHERE id=q) IS DISTINCT FROM base+price THEN RAISE EXCEPTION 'Scheduling must retain groom on combined quote'; END IF;
  IF (SELECT auto_invoice_grooming FROM public.invoicing_settings WHERE tenant_id=t) IS DISTINCT FROM setting_before THEN RAISE EXCEPTION 'Scheduling must preserve tenant settings'; END IF;
  inv:=public.hotel_review_action(b,'confirm','{}');
  IF (SELECT invoice_id FROM public.bookings WHERE id=groom) IS DISTINCT FROM inv OR (SELECT billed_invoice_id FROM public.hotel_grooming_requests WHERE id=rid) IS DISTINCT FROM inv THEN RAISE EXCEPTION 'Confirmation must attach scheduled groom to the one hotel invoice'; END IF;
  IF (SELECT total FROM public.invoices WHERE id=inv) IS DISTINCT FROM base+price THEN RAISE EXCEPTION 'Combined invoice must include groom exactly once'; END IF;
  SELECT count(*) INTO n FROM public.invoice_items WHERE invoice_id=inv;
  UPDATE public.grooming_booking_details SET grooming_notes='After confirmation' WHERE booking_id=groom;
  IF public.ensure_booking_invoice(groom) IS DISTINCT FROM inv OR (SELECT count(*) FROM public.invoice_items WHERE invoice_id=inv)<>n THEN RAISE EXCEPTION 'Subsequent grooming saves must not create duplicate billing'; END IF;
  IF public.hotel_review_action(b,'confirm','{}') IS DISTINCT FROM inv THEN RAISE EXCEPTION 'Repeated confirmation must reuse the invoice'; END IF;

  INSERT INTO public.bookings(tenant_id,customer_id,booking_number,service_type,status,source,start_at,end_at,start_date,end_date,suppress_initial_emails)
  VALUES(t,c,'TEST-CHECKOUT-GROOM-'||gen_random_uuid(),'hotel_dog','requested','staff_capture','2027-02-02 09:00+02','2027-02-09 09:00+02','2027-02-02','2027-02-09',true) RETURNING id INTO b2;
  INSERT INTO public.booking_pets(tenant_id,booking_id,pet_id,accommodation_type) SELECT t,b2,p,accommodation_type FROM public.booking_pets WHERE booking_id=h.id AND pet_id=p;
  INSERT INTO public.hotel_booking_details(tenant_id,booking_id,accommodation_type) SELECT t,b2,accommodation_type FROM public.hotel_booking_details WHERE booking_id=h.id;
  q:=public.hotel_review_action(b2,'estimate','{}');
  SELECT total INTO base FROM public.estimates WHERE id=q;
  groom:=public.create_checkout_groom(b2,p,pkg,'10:00');
  IF (SELECT parent_booking_id FROM public.bookings WHERE id=groom) IS DISTINCT FROM b2 OR (SELECT invoice_id FROM public.bookings WHERE id=groom) IS NOT NULL THEN RAISE EXCEPTION 'Alternate checkout creation must use combined billing too'; END IF;
  IF (SELECT total FROM public.estimates WHERE id=q) IS DISTINCT FROM base+price THEN RAISE EXCEPTION 'Alternate checkout creation must persist package and refresh quote'; END IF;
  RAISE EXCEPTION USING ERRCODE='P0002',MESSAGE='HOTEL_GROOM_REGRESSIONS_PASSED_ROLLBACK';
 EXCEPTION WHEN no_data_found THEN IF SQLERRM<>'HOTEL_GROOM_REGRESSIONS_PASSED_ROLLBACK' THEN RAISE; END IF;
 END;
END $$;
