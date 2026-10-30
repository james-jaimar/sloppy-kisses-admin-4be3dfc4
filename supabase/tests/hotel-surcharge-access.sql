-- Run through the connected database migration tool. All fixtures roll back.
DO $$
DECLARE t uuid; c uuid; actor uuid; owner_actor uuid; other_c uuid;
        b uuid; other_b uuid; s uuid; row_id uuid; n integer; r record;
BEGIN
 SELECT c0.tenant_id,c0.id,p.auth_user_id INTO t,c,owner_actor
 FROM public.customers c0 JOIN public.profiles p ON p.id=c0.linked_profile_id
 WHERE c0.portal_access_enabled AND p.auth_user_id IS NOT NULL
 AND NOT public.user_has_tenant_access(c0.tenant_id) LIMIT 1;
 -- The database executor is not signed in; select a real portal-enabled fixture owner.
 IF c IS NULL THEN RAISE EXCEPTION 'Portal-enabled customer required'; END IF;
 SELECT id INTO other_c FROM public.customers WHERE tenant_id=t AND id<>c LIMIT 1;
 SELECT id INTO s FROM public.hotel_surcharges WHERE tenant_id=t AND code='walk' AND active LIMIT 1;
 SELECT p.auth_user_id INTO actor FROM public.profiles p
 JOIN public.tenant_users tu ON tu.profile_id=p.id
 JOIN public.user_roles ur ON ur.tenant_user_id=tu.id JOIN public.roles ro ON ro.id=ur.role_id
 WHERE tu.tenant_id=t AND tu.status='active' AND ro.code='staff_frontdesk' LIMIT 1;
 IF other_c IS NULL OR s IS NULL OR actor IS NULL THEN RAISE EXCEPTION 'Front desk, walk catalog and two customers required'; END IF;
 BEGIN
  INSERT INTO public.bookings(tenant_id,customer_id,booking_number,service_type,status,source,start_at,end_at,start_date,end_date,suppress_initial_emails)
  VALUES(t,c,'TEST-EXTRAS-'||gen_random_uuid(),'hotel_dog','draft','staff_capture','2027-02-01 09:00+02','2027-02-12 09:00+02','2027-02-01','2027-02-12',true) RETURNING id INTO b;
  INSERT INTO public.bookings(tenant_id,customer_id,booking_number,service_type,status,source,start_at,end_at,start_date,end_date,suppress_initial_emails)
  VALUES(t,other_c,'TEST-EXTRAS-OTHER-'||gen_random_uuid(),'hotel_dog','draft','staff_capture','2027-02-01 09:00+02','2027-02-12 09:00+02','2027-02-01','2027-02-12',true) RETURNING id INTO other_b;
  PERFORM set_config('request.jwt.claim.sub',actor::text,true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  INSERT INTO public.hotel_booking_surcharges(tenant_id,booking_id,surcharge_id,quantity,quantity_basis)
  VALUES(t,b,s,11,'total') RETURNING id INTO row_id;
  UPDATE public.hotel_booking_surcharges SET quantity=22 WHERE id=row_id;
  IF (SELECT quantity FROM public.hotel_booking_surcharges WHERE id=row_id) IS DISTINCT FROM 22::numeric THEN RAISE EXCEPTION 'Front desk must save and edit extras'; END IF;
  DELETE FROM public.hotel_booking_surcharges WHERE id=row_id;
  GET DIAGNOSTICS n=ROW_COUNT;
  IF n<>1 THEN RAISE EXCEPTION 'Front desk must replace extras'; END IF;
  INSERT INTO public.hotel_booking_surcharges(tenant_id,booking_id,surcharge_id,quantity,quantity_basis) VALUES(t,b,s,11,'total'),(t,other_b,s,1,'total');
  PERFORM set_config('request.jwt.claim.sub',owner_actor::text,true);
  IF public.user_has_tenant_access(t) THEN RAISE EXCEPTION 'Customer fixture must not have staff access'; END IF;
  IF (SELECT count(*) FROM public.hotel_booking_surcharges WHERE booking_id=b)<>1 THEN RAISE EXCEPTION 'Customer must read own extras'; END IF;
  IF EXISTS(SELECT 1 FROM public.hotel_booking_surcharges WHERE booking_id=other_b) THEN RAISE EXCEPTION 'Customer must not read another customer extras'; END IF;
  BEGIN
   INSERT INTO public.hotel_booking_surcharges(tenant_id,booking_id,surcharge_id,quantity) VALUES(t,b,s,1);
   RAISE EXCEPTION 'Customer direct insert unexpectedly allowed';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  UPDATE public.hotel_booking_surcharges SET quantity=99 WHERE booking_id=b;
  GET DIAGNOSTICS n=ROW_COUNT;
  IF n<>0 THEN RAISE EXCEPTION 'Customer must not edit extras directly'; END IF;
  DELETE FROM public.hotel_booking_surcharges WHERE booking_id=b;
  GET DIAGNOSTICS n=ROW_COUNT;
  IF n<>0 THEN RAISE EXCEPTION 'Customer must not delete extras directly'; END IF;
  EXECUTE 'RESET ROLE';
  EXECUTE 'SET LOCAL ROLE anon';
  IF EXISTS(SELECT 1 FROM public.hotel_booking_surcharges WHERE booking_id IN(b,other_b)) THEN RAISE EXCEPTION 'Anonymous users must not read booking extras'; END IF;
  EXECUTE 'RESET ROLE';
  FOR r IN SELECT ro.code FROM public.roles ro WHERE ro.code IN ('tenant_owner','tenant_admin','staff_frontdesk','staff_hotel') LOOP
   IF NOT EXISTS(SELECT 1 FROM public.roles ro JOIN public.role_permissions rp ON rp.role_id=ro.id JOIN public.permissions p ON p.id=rp.permission_id WHERE ro.code=r.code AND p.code='bookings.update') THEN RAISE EXCEPTION 'Role % requires existing update permission',r.code; END IF;
  END LOOP;
  IF EXISTS(SELECT 1 FROM public.invoices WHERE booking_id IN(b,other_b)) THEN RAISE EXCEPTION 'Saving draft extras must not issue invoice'; END IF;
  RAISE EXCEPTION USING ERRCODE='P0002',MESSAGE='SURCHARGE_ACCESS_PASSED_ROLLBACK';
 EXCEPTION WHEN no_data_found THEN
  IF SQLERRM<>'SURCHARGE_ACCESS_PASSED_ROLLBACK' THEN RAISE; END IF;
 END;
END $$;