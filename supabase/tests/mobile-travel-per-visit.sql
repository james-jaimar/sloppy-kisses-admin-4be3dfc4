-- Run with the migration tool; all fixtures and side effects roll back.
DO $$
DECLARE t uuid; c uuid; v uuid; grp uuid:=gen_random_uuid(); a uuid; b uuid; fee numeric;
BEGIN
 SELECT tenant_id,id INTO t,c FROM public.customers LIMIT 1;
 SELECT id INTO v FROM public.resources WHERE tenant_id=t AND type='mobile_van' AND active LIMIT 1;
 SELECT default_mobile_travel_fee_zar INTO fee FROM public.grooming_workflow_settings WHERE tenant_id=t;
 IF c IS NULL OR v IS NULL OR fee IS NULL OR fee<=0 THEN RAISE EXCEPTION 'Travel fee fixtures unavailable'; END IF;
 BEGIN
 INSERT INTO public.bookings(tenant_id,customer_id,booking_number,service_type,status,start_at,end_at,resource_id,booking_group_id,suppress_initial_emails)
 VALUES(t,c,'TEST-TRAVEL-'||gen_random_uuid(),'grooming_mobile','draft','2027-02-01 09:00+02','2027-02-01 10:00+02',v,grp,true) RETURNING id INTO a;
 INSERT INTO public.bookings(tenant_id,customer_id,booking_number,service_type,status,start_at,end_at,resource_id,booking_group_id,suppress_initial_emails)
 VALUES(t,c,'TEST-TRAVEL-'||gen_random_uuid(),'grooming_mobile','draft','2027-02-01 10:00+02','2027-02-01 11:00+02',v,grp,true) RETURNING id INTO b;
 INSERT INTO public.grooming_booking_details(tenant_id,booking_id,grooming_mode,travel_fee) VALUES(t,a,'mobile',fee),(t,b,'mobile',fee);
 IF (SELECT sum(travel_fee) FROM public.grooming_booking_details WHERE booking_id IN(a,b))<>fee THEN RAISE EXCEPTION 'Two dogs must pay only one configured travel fee'; END IF;
 UPDATE public.grooming_booking_details SET grooming_notes='reopened' WHERE booking_id=b;
 IF (SELECT travel_fee FROM public.grooming_booking_details WHERE booking_id=b)<>0 THEN RAISE EXCEPTION 'Reopening second dog must not restore fee'; END IF;
 RAISE EXCEPTION USING ERRCODE='P0002',MESSAGE='TRAVEL_TEST_ROLLBACK';
 EXCEPTION WHEN no_data_found THEN IF SQLERRM<>'TRAVEL_TEST_ROLLBACK' THEN RAISE; END IF; END;
END $$;