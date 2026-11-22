-- Database-owner regression. All fixture changes roll back inside the subtransaction.
DO $$
DECLARE t uuid; c uuid; p uuid; actor uuid; b uuid; q uuid; inv uuid; gr uuid; groom uuid;
 pkg uuid; room uuid; before_count int; before_lines int; billing boolean; checks jsonb;
BEGIN
 SELECT pets.tenant_id,pets.customer_id,pets.id INTO t,c,p FROM public.pets
 WHERE species='dog' AND status='active' LIMIT 1;
 SELECT auth_user_id INTO actor FROM public.profiles WHERE user_type='platform' AND auth_user_id IS NOT NULL LIMIT 1;
 IF p IS NULL OR actor IS NULL THEN RAISE EXCEPTION 'Need an existing owner/pet and authorised staff actor'; END IF;
 PERFORM set_config('request.jwt.claim.sub',actor::text,true);
 IF NOT public.user_has_permission(t,'bookings.edit') THEN RAISE EXCEPTION 'Staff permission missing'; END IF;
 BEGIN
  UPDATE public.xero_settings SET auto_push=false WHERE tenant_id=t;
  UPDATE public.customers SET notify_email=false WHERE id=c;
  INSERT INTO public.bookings(tenant_id,customer_id,booking_number,service_type,status,source,start_at,end_at,start_date,end_date,suppress_initial_emails)
  VALUES(t,c,'TEST-LEGACY-'||gen_random_uuid(),'hotel_dog','draft','staff_capture','2027-02-01 09:00+02','2027-02-03 09:00+02','2027-02-01','2027-02-03',true) RETURNING id INTO b;
  INSERT INTO public.booking_pets(tenant_id,booking_id,pet_id,accommodation_type) VALUES(t,b,p,'hotel');
  INSERT INTO public.hotel_booking_details(tenant_id,booking_id,accommodation_type) VALUES(t,b,'hotel');
  INSERT INTO public.estimates(tenant_id,customer_id,estimate_number,status,service_type,start_at,end_at,booking_id,pet_ids,subtotal,total,created_via,extras)
  VALUES(t,c,'TEST-LEGACY-QUOTE-'||gen_random_uuid(),'accepted','hotel_dog','2027-02-01 09:00+02','2027-02-03 09:00+02',b,ARRAY[p],5002.50,5002.50,'hotel_sheet_import',
   jsonb_build_object('legacy_hotel_import',jsonb_build_object('start_date','2027-02-01','end_date','2027-02-03','billed_groom_pet_ids',jsonb_build_array(p::text)))) RETURNING id INTO q;
  INSERT INTO public.estimate_items(tenant_id,estimate_id,booking_id,description,quantity,unit_price,line_total,sort_order)
  VALUES(t,q,b,'Imported accommodation',1,4480,4480,0),(t,q,b,'Imported Stay & Play',1,250,250,1),(t,q,b,'Imported departure groom',1,272.50,272.50,2);
  SELECT jsonb_object_agg(x->>'code',true) INTO checks FROM public.hotel_workflow_settings w CROSS JOIN LATERAL jsonb_array_elements(w.approval_checklist) x WHERE w.tenant_id=t;
  INSERT INTO public.hotel_booking_reviews(tenant_id,booking_id,estimate_id,checklist) VALUES(t,b,q,checks)
   ON CONFLICT(booking_id) DO UPDATE SET estimate_id=q,checklist=checks;
  UPDATE public.bookings SET estimate_id=q,status='needs_info' WHERE id=b;
  inv:=public.hotel_review_action(b,'confirm','{}');
  IF (SELECT total FROM public.invoices WHERE id=inv)<>5002.50 THEN RAISE EXCEPTION 'Imported quote must retain R5002.50 including VAT'; END IF;
  IF (SELECT estimate_id FROM public.hotel_booking_reviews WHERE booking_id=b)<>q THEN RAISE EXCEPTION 'Imported quote was replaced'; END IF;
  IF public.hotel_review_action(b,'confirm','{}')<>inv THEN RAISE EXCEPTION 'Repeated confirmation duplicated invoice'; END IF;
  SELECT id INTO pkg FROM public.grooming_packages WHERE tenant_id=t AND active AND species='dog' ORDER BY sort_order LIMIT 1;
  SELECT id INTO room FROM public.resources WHERE tenant_id=t AND active AND type='inhouse_grooming' ORDER BY sort_order LIMIT 1;
  INSERT INTO public.hotel_grooming_requests(tenant_id,hotel_booking_id,customer_id,pet_id,window_start,window_end,status,package_id)
  VALUES(t,b,c,p,'2027-02-01','2027-02-03','pending',pkg) RETURNING id INTO gr;
  SELECT count(*) INTO before_count FROM public.invoices WHERE tenant_id=t;
  SELECT count(*) INTO before_lines FROM public.invoice_items WHERE invoice_id=inv;
  SELECT auto_invoice_grooming INTO billing FROM public.invoicing_settings WHERE tenant_id=t;
  groom:=public.schedule_hotel_groom(gr,'2027-02-03 09:00+02','2027-02-03 10:00+02',pkg,room,'Rollback-only imported groom');
  IF (SELECT invoice_id FROM public.bookings WHERE id=groom)<>inv THEN RAISE EXCEPTION 'Billed groom must reuse hotel invoice'; END IF;
  IF (SELECT count(*) FROM public.invoices WHERE tenant_id=t)<>before_count THEN RAISE EXCEPTION 'Billed groom created another invoice'; END IF;
  IF (SELECT count(*) FROM public.invoice_items WHERE invoice_id=inv)<>before_lines THEN RAISE EXCEPTION 'Billed groom added another charge'; END IF;
  IF (SELECT auto_invoice_grooming FROM public.invoicing_settings WHERE tenant_id=t) IS DISTINCT FROM billing THEN RAISE EXCEPTION 'Billing setting was not restored'; END IF;
  RAISE EXCEPTION USING ERRCODE='P0002',MESSAGE='LEGACY_HOTEL_PASSED_ROLLBACK';
 EXCEPTION WHEN no_data_found THEN IF SQLERRM<>'LEGACY_HOTEL_PASSED_ROLLBACK' THEN RAISE; END IF; END;
END $$;