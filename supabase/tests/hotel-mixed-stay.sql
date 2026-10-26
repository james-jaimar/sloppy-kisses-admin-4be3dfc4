-- Owner regression. Fixtures, quotes, invoices and notifications all roll back.
DO $$
DECLARE t uuid; c uuid; dog uuid; dog2 uuid; cat uuid; actor uuid; b uuid; eid uuid; inv uuid;
dr text; cr text; snap jsonb; cn uuid; cn_total numeric; dp numeric; ep numeric; cp numeric; expected numeric; checklist jsonb; token uuid;
BEGIN
 SELECT tenant_id,customer_id,id INTO t,c,dog FROM public.pets WHERE species='dog' LIMIT 1;
 SELECT accommodation_type,nightly_rate_zar,extra_pet_rate_zar INTO dr,dp,ep FROM public.hotel_rate_cards WHERE tenant_id=t AND species='dog' AND active AND nightly_rate_zar>0 LIMIT 1;
 SELECT accommodation_type,nightly_rate_zar INTO cr,cp FROM public.hotel_rate_cards WHERE tenant_id=t AND species='cat' AND active AND nightly_rate_zar>0 LIMIT 1;
 SELECT auth_user_id INTO actor FROM public.profiles WHERE user_type='platform' AND auth_user_id IS NOT NULL LIMIT 1;
 IF dog IS NULL OR dr IS NULL OR cr IS NULL OR actor IS NULL THEN RAISE EXCEPTION 'Configured dog/cat rates and authorized actor required'; END IF;
 PERFORM set_config('request.jwt.claim.sub',actor::text,true);
 IF NOT public.user_has_permission(t,'bookings.edit') THEN RAISE EXCEPTION 'Actor lacks edit permission'; END IF;
 BEGIN
  UPDATE public.hotel_workflow_settings SET peak_start_month_day=NULL,peak_end_month_day=NULL,long_stay_discount_pct=0 WHERE tenant_id=t;
  INSERT INTO public.pets(tenant_id,customer_id,name,species) VALUES(t,c,'TEST mixed dog','dog') RETURNING id INTO dog2;
  INSERT INTO public.pets(tenant_id,customer_id,name,species) VALUES(t,c,'TEST mixed cat','cat') RETURNING id INTO cat;
  INSERT INTO public.bookings(tenant_id,customer_id,booking_number,service_type,status,source,start_at,end_at,start_date,end_date,suppress_initial_emails)
  VALUES(t,c,'TEST-MIXED-'||gen_random_uuid(),'hotel_dog','draft','staff_capture','2027-02-01 09:00+02','2027-02-12 09:00+02','2027-02-01','2027-02-12',true) RETURNING id INTO b;
  INSERT INTO public.booking_pets(tenant_id,booking_id,pet_id,accommodation_type) VALUES(t,b,dog,dr),(t,b,dog2,dr),(t,b,cat,cr);
  INSERT INTO public.hotel_booking_details(tenant_id,booking_id,accommodation_type) VALUES(t,b,dr);
  expected:=11*(dp+CASE WHEN ep>0 THEN ep ELSE 0 END+cp);
  IF (SELECT sum(line_total) FROM public.hotel_booking_stay_lines(b)) IS DISTINCT FROM expected THEN RAISE EXCEPTION 'Mixed stay must use dog, second-dog and cat rates for 11 nights'; END IF;
  eid:=public.hotel_review_action(b,'estimate','{}');
  SELECT public_token INTO token FROM public.estimates WHERE id=eid;
  PERFORM public.accept_public_quote(token);
  IF (SELECT status FROM public.bookings WHERE id=b)<>'needs_info' OR EXISTS(SELECT 1 FROM public.invoices WHERE booking_id=b) THEN RAISE EXCEPTION 'Mixed quote acceptance must gather information without invoicing'; END IF;
  IF (SELECT count(*) FROM public.booking_pets WHERE booking_id=b)<>3 THEN RAISE EXCEPTION 'All three pets must stay on one booking'; END IF;
  SELECT jsonb_object_agg(x->>'code',true) INTO checklist FROM public.hotel_workflow_settings w CROSS JOIN LATERAL jsonb_array_elements(w.approval_checklist) x WHERE w.tenant_id=t;
  PERFORM public.hotel_review_action(b,'save',jsonb_build_object('checklist',checklist));
  inv:=public.hotel_review_action(b,'confirm','{}');
  IF inv IS NULL OR NOT EXISTS(SELECT 1 FROM public.invoice_items WHERE invoice_id=inv AND description LIKE '%TEST mixed cat%') THEN RAISE EXCEPTION 'Confirmed invoice must contain the cat accommodation line'; END IF;
  IF public.hotel_review_action(b,'confirm','{}')<>inv THEN RAISE EXCEPTION 'Confirmation must not duplicate the invoice'; END IF;
  -- Removing the cat after invoicing drafts a credit note for its nights; the invoice is untouched.
  SELECT jsonb_agg(jsonb_build_object('pet_id',p.id,'name',p.name,'species',p.species,'accommodation_type',bp.accommodation_type)) INTO snap
    FROM public.booking_pets bp JOIN public.pets p ON p.id=bp.pet_id WHERE bp.booking_id=b;
  expected:=(SELECT total FROM public.invoices WHERE id=inv);
  DELETE FROM public.booking_pets WHERE booking_id=b AND pet_id=cat;
  cn:=public.draft_hotel_pet_removal_credit(b,snap);
  SELECT total INTO cn_total FROM public.credit_notes WHERE id=cn AND status='draft' AND invoice_id=inv;
  IF cn_total IS DISTINCT FROM 11*cp THEN RAISE EXCEPTION 'Removing the cat must draft a credit of 11 cat nights, got %',cn_total; END IF;
  IF (SELECT total FROM public.invoices WHERE id=inv)<>expected THEN RAISE EXCEPTION 'Issued invoice must not change'; END IF;
  IF public.draft_hotel_pet_removal_credit(b,(SELECT jsonb_agg(e) FROM jsonb_array_elements(snap) e WHERE e->>'pet_id'<>cat::text)) IS NOT NULL THEN RAISE EXCEPTION 'No change must draft no credit'; END IF;
  RAISE EXCEPTION USING ERRCODE='P0002',MESSAGE='MIXED_STAY_PASSED_ROLLBACK';
 EXCEPTION WHEN no_data_found THEN IF SQLERRM<>'MIXED_STAY_PASSED_ROLLBACK' THEN RAISE; END IF; END;
END $$;