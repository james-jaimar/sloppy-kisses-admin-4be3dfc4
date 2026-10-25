-- Owner-only regression. All fixtures and temporary settings roll back.
DO $$
DECLARE t uuid; c uuid; dog uuid; cat uuid; b uuid; dr uuid; cr uuid; wrong_room boolean:=false; full_room boolean:=false; used_count integer;
BEGIN
 SELECT tenant_id,customer_id,id INTO t,c,dog FROM public.pets WHERE species='dog' LIMIT 1;
 IF dog IS NULL THEN RAISE EXCEPTION 'A configured dog customer is required'; END IF;
 BEGIN
  UPDATE public.hotel_workflow_settings SET overbooking_mode='block' WHERE tenant_id=t;
  INSERT INTO public.resources(tenant_id,type,name,capacity,active) VALUES(t,'hotel_area','TEST dog room',1,true) RETURNING id INTO dr;
  INSERT INTO public.resources(tenant_id,type,name,capacity,active) VALUES(t,'cattery_area','TEST cat room',1,true) RETURNING id INTO cr;
  INSERT INTO public.pets(tenant_id,customer_id,name,species) VALUES(t,c,'TEST cat','cat') RETURNING id INTO cat;
  INSERT INTO public.bookings(tenant_id,customer_id,booking_number,service_type,status,source,start_at,end_at,start_date,end_date,suppress_initial_emails)
  VALUES(t,c,'TEST-ROOM-'||gen_random_uuid(),'hotel_dog','draft','staff_capture','2027-02-01 09:00+02','2027-02-08 09:00+02','2027-02-01','2027-02-08',true) RETURNING id INTO b;
  INSERT INTO public.booking_pets(tenant_id,booking_id,pet_id,resource_id) VALUES(t,b,dog,dr),(t,b,cat,cr);
  PERFORM set_config('request.jwt.claim.role','service_role',true);
  SELECT used INTO used_count FROM public.hotel_day_availability(t,'2027-02-01','2027-02-08',NULL) WHERE resource_id=cr AND day='2027-02-03';
  IF used_count IS DISTINCT FROM 1 THEN RAISE EXCEPTION 'Cat room must count one cat despite null booking resource'; END IF;
  SELECT used INTO used_count FROM public.hotel_day_availability(t,'2027-02-01','2027-02-08',NULL) WHERE resource_id=dr AND day='2027-02-03';
  IF used_count IS DISTINCT FROM 1 THEN RAISE EXCEPTION 'Dog room must count one dog, not both pets'; END IF;
  SELECT used INTO used_count FROM public.hotel_day_availability(t,'2027-02-08','2027-02-09',NULL) WHERE resource_id=cr;
  IF used_count IS DISTINCT FROM 0 THEN RAISE EXCEPTION 'Checkout date must not consume a night'; END IF;
  BEGIN UPDATE public.booking_pets SET resource_id=dr WHERE booking_id=b AND pet_id=cat;
  EXCEPTION WHEN raise_exception THEN wrong_room:=SQLERRM LIKE 'Choose an active Cat Hotel%'; END;
  IF NOT wrong_room THEN RAISE EXCEPTION 'Cat in Dog Hotel must fail'; END IF;
  BEGIN
   INSERT INTO public.pets(tenant_id,customer_id,name,species) VALUES(t,c,'TEST second cat','cat') RETURNING id INTO cat;
   INSERT INTO public.booking_pets(tenant_id,booking_id,pet_id,resource_id) VALUES(t,b,cat,cr);
  EXCEPTION WHEN raise_exception THEN full_room:=SQLERRM LIKE '%full on one or more nights%'; END;
  IF NOT full_room THEN RAISE EXCEPTION 'Room capacity must block a second cat'; END IF;
  RAISE EXCEPTION USING ERRCODE='P0002',MESSAGE='HOTEL_ROOMS_PASSED_ROLLBACK';
 EXCEPTION WHEN no_data_found THEN IF SQLERRM<>'HOTEL_ROOMS_PASSED_ROLLBACK' THEN RAISE; END IF; END;
END $$;