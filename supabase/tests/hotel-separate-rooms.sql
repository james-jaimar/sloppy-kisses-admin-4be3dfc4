-- Owner regression (rolls back): shared room uses extra-pet rate; separate rooms charge each pet the full nightly rate.
DO $$
DECLARE t uuid; c uuid; dog uuid; dog2 uuid; b uuid; dr text; dp numeric; ep numeric; shared numeric; sep numeric;
BEGIN
 SELECT tenant_id,customer_id,id INTO t,c,dog FROM public.pets WHERE species='dog' LIMIT 1;
 SELECT accommodation_type,nightly_rate_zar,extra_pet_rate_zar INTO dr,dp,ep FROM public.hotel_rate_cards WHERE tenant_id=t AND species='dog' AND active AND nightly_rate_zar>0 AND extra_pet_rate_zar>0 LIMIT 1;
 BEGIN
  UPDATE public.hotel_workflow_settings SET peak_start_month_day=NULL,peak_end_month_day=NULL WHERE tenant_id=t;
  INSERT INTO public.pets(tenant_id,customer_id,name,species) VALUES(t,c,'TEST dog 2','dog') RETURNING id INTO dog2;
  INSERT INTO public.bookings(tenant_id,customer_id,booking_number,service_type,status,source,start_at,end_at,start_date,end_date,suppress_initial_emails)
  VALUES(t,c,'TEST-SEP-'||gen_random_uuid(),'hotel_dog','draft','staff_capture','2027-03-01 09:00+02','2027-03-05 09:00+02','2027-03-01','2027-03-05',true) RETURNING id INTO b;
  INSERT INTO public.booking_pets(tenant_id,booking_id,pet_id,accommodation_type) VALUES(t,b,dog,dr),(t,b,dog2,dr);
  INSERT INTO public.hotel_booking_details(tenant_id,booking_id,accommodation_type) VALUES(t,b,dr);
  SELECT sum(line_total) INTO shared FROM public.hotel_booking_stay_lines(b);
  UPDATE public.hotel_booking_details SET separate_rooms=true WHERE booking_id=b;
  SELECT sum(line_total) INTO sep FROM public.hotel_booking_stay_lines(b);
  IF shared<>4*(dp+ep) THEN RAISE EXCEPTION 'shared % expected %',shared,4*(dp+ep); END IF;
  IF sep<>8*dp THEN RAISE EXCEPTION 'separate % expected %',sep,8*dp; END IF;
  RAISE EXCEPTION USING ERRCODE='P0002',MESSAGE='SEP_PASSED';
 EXCEPTION WHEN no_data_found THEN IF SQLERRM<>'SEP_PASSED' THEN RAISE; END IF; END;
END $$;
