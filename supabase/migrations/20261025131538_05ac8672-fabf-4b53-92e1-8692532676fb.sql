CREATE OR REPLACE FUNCTION public.hotel_day_availability(p_tenant_id uuid,p_start date,p_end date,p_exclude_booking_id uuid DEFAULT NULL) RETURNS TABLE(resource_id uuid,resource_name text,capacity integer,day date,used integer) LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
WITH allowed AS (SELECT auth.role()='service_role' OR public.user_has_tenant_access(p_tenant_id) OR EXISTS(SELECT 1 FROM public.customers WHERE tenant_id=p_tenant_id AND linked_profile_id=public.current_profile_id()) AS ok), days AS (SELECT generate_series(p_start,GREATEST(p_start,p_end-1),interval '1 day')::date d), res AS (SELECT id,name,capacity,type FROM public.resources WHERE tenant_id=p_tenant_id AND active AND type IN ('hotel_area','cattery_area')), stays AS (SELECT b.id,b.resource_id,(b.start_at AT TIME ZONE 'Africa/Johannesburg')::date s,COALESCE((b.end_at AT TIME ZONE 'Africa/Johannesburg')::date,(b.start_at AT TIME ZONE 'Africa/Johannesburg')::date+1) e FROM public.bookings b WHERE b.tenant_id=p_tenant_id AND b.service_type IN ('hotel_dog','hotel_cat') AND b.status NOT IN ('cancelled','no_show','completed','checked_out') AND (p_exclude_booking_id IS NULL OR b.id<>p_exclude_booking_id)), occ AS (SELECT CASE WHEN r.type::text=CASE WHEN p.species='cat' THEN 'cattery_area' ELSE 'hotel_area' END THEN r.id END rid,st.s,st.e FROM stays st JOIN public.booking_pets bp ON bp.booking_id=st.id JOIN public.pets p ON p.id=bp.pet_id LEFT JOIN public.resources r ON r.id=COALESCE(bp.resource_id,st.resource_id) UNION ALL SELECT st.resource_id,st.s,st.e FROM stays st WHERE NOT EXISTS(SELECT 1 FROM public.booking_pets bp WHERE bp.booking_id=st.id)) SELECT res.id,res.name,res.capacity,days.d,COALESCE((SELECT count(*)::integer FROM occ WHERE rid=res.id AND days.d>=s AND days.d<e),0) FROM res CROSS JOIN days WHERE (SELECT ok FROM allowed) ORDER BY res.name,days.d;
$$;
REVOKE ALL ON FUNCTION public.hotel_day_availability(uuid,date,date,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.hotel_day_availability(uuid,date,date,uuid) TO authenticated,service_role;
CREATE OR REPLACE FUNCTION public.hotel_house_availability(p_tenant_id uuid,p_start date,p_end date,p_species text DEFAULT 'dog') RETURNS TABLE(day date,capacity integer,used integer) LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
WITH days AS (SELECT generate_series(p_start,GREATEST(p_start,p_end-1),interval '1 day')::date d WHERE p_end>p_start AND p_end-p_start<=366), cap AS (SELECT COALESCE(sum(r.capacity),0)::integer total FROM public.resources r WHERE r.tenant_id=p_tenant_id AND r.active AND r.type::text=CASE WHEN p_species='cat' THEN 'cattery_area' ELSE 'hotel_area' END), stays AS (SELECT b.id,b.service_type,(b.start_at AT TIME ZONE 'Africa/Johannesburg')::date s,COALESCE((b.end_at AT TIME ZONE 'Africa/Johannesburg')::date,(b.start_at AT TIME ZONE 'Africa/Johannesburg')::date+1) e FROM public.bookings b WHERE b.tenant_id=p_tenant_id AND b.service_type IN ('hotel_dog','hotel_cat') AND b.status NOT IN ('cancelled','no_show','completed','checked_out')), occ AS (SELECT st.s,st.e FROM stays st JOIN public.booking_pets bp ON bp.booking_id=st.id JOIN public.pets p ON p.id=bp.pet_id WHERE p.species::text=p_species UNION ALL SELECT st.s,st.e FROM stays st WHERE st.service_type::text=CASE WHEN p_species='cat' THEN 'hotel_cat' ELSE 'hotel_dog' END AND NOT EXISTS(SELECT 1 FROM public.booking_pets bp WHERE bp.booking_id=st.id)) SELECT days.d,(SELECT total FROM cap),COALESCE((SELECT count(*)::integer FROM occ WHERE days.d>=s AND days.d<e),0) FROM days WHERE p_species IN ('dog','cat') AND EXISTS(SELECT 1 FROM public.tenants WHERE id=p_tenant_id AND status='active') ORDER BY days.d;
$$;
REVOKE ALL ON FUNCTION public.hotel_house_availability(uuid,date,date,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.hotel_house_availability(uuid,date,date,text) TO anon,authenticated,service_role;
CREATE OR REPLACE FUNCTION public.hotel_allocate_pet_room() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE b public.bookings; pet public.pets; target public.resources; candidate public.resources; wanted text; s date; e date; mode text; available boolean; explicitly_selected boolean;
BEGIN
SELECT * INTO b FROM public.bookings WHERE id=NEW.booking_id;
IF b.service_type NOT IN ('hotel_dog','hotel_cat') THEN RETURN NEW; END IF;
SELECT * INTO pet FROM public.pets WHERE id=NEW.pet_id;
IF pet.id IS NULL OR pet.customer_id<>b.customer_id OR pet.tenant_id<>b.tenant_id OR NEW.tenant_id<>b.tenant_id THEN RAISE EXCEPTION 'Hotel pet must belong to the booking customer'; END IF;
IF pet.species NOT IN ('dog','cat') THEN RAISE EXCEPTION 'Hotel rooms support dogs and cats only'; END IF;
wanted:=CASE WHEN pet.species='cat' THEN 'cattery_area' ELSE 'hotel_area' END;
s:=(b.start_at AT TIME ZONE 'Africa/Johannesburg')::date; e:=COALESCE((b.end_at AT TIME ZONE 'Africa/Johannesburg')::date,s+1);
SELECT overbooking_mode INTO mode FROM public.hotel_workflow_settings WHERE tenant_id=b.tenant_id;
PERFORM pg_advisory_xact_lock(hashtextextended(b.tenant_id::text||':hotel-rooms',0));
explicitly_selected:=NEW.resource_id IS NOT NULL;
IF NEW.resource_id IS NOT NULL THEN
 SELECT * INTO target FROM public.resources WHERE id=NEW.resource_id AND tenant_id=b.tenant_id AND active AND type::text=wanted;
 IF target.id IS NULL THEN RAISE EXCEPTION 'Choose an active % area for %',CASE WHEN pet.species='cat' THEN 'Cat Hotel' ELSE 'Dog Hotel' END,pet.name; END IF;
ELSE
 FOR candidate IN SELECT * FROM public.resources WHERE tenant_id=b.tenant_id AND active AND type::text=wanted ORDER BY (id=b.resource_id) DESC,sort_order,name LOOP
  SELECT NOT EXISTS(SELECT 1 FROM generate_series(s,e-1,interval '1 day') d WHERE candidate.capacity IS NOT NULL AND candidate.capacity<(1+(SELECT count(*) FROM public.booking_pets bp JOIN public.bookings other ON other.id=bp.booking_id JOIN public.pets op ON op.id=bp.pet_id WHERE bp.id<>NEW.id AND other.tenant_id=b.tenant_id AND other.service_type IN ('hotel_dog','hotel_cat') AND other.status NOT IN ('cancelled','no_show','completed','checked_out') AND op.species=pet.species AND COALESCE(bp.resource_id,other.resource_id)=candidate.id AND d::date>=(other.start_at AT TIME ZONE 'Africa/Johannesburg')::date AND d::date<COALESCE((other.end_at AT TIME ZONE 'Africa/Johannesburg')::date,(other.start_at AT TIME ZONE 'Africa/Johannesburg')::date+1)))) INTO available;
  IF available THEN target:=candidate; EXIT; END IF;
 END LOOP;
 NEW.resource_id:=target.id;
END IF;
IF mode='block' AND b.status NOT IN ('cancelled','no_show','completed','checked_out') THEN
 IF target.id IS NULL THEN RAISE EXCEPTION 'No % room has space for every night of this stay',CASE WHEN pet.species='cat' THEN 'Cat Hotel' ELSE 'Dog Hotel' END; END IF;
 IF explicitly_selected THEN
  IF EXISTS(SELECT 1 FROM generate_series(s,e-1,interval '1 day') d WHERE target.capacity IS NOT NULL AND target.capacity<(1+(SELECT count(*) FROM public.booking_pets bp JOIN public.bookings other ON other.id=bp.booking_id JOIN public.pets op ON op.id=bp.pet_id WHERE bp.id<>NEW.id AND other.tenant_id=b.tenant_id AND other.service_type IN ('hotel_dog','hotel_cat') AND other.status NOT IN ('cancelled','no_show','completed','checked_out') AND op.species=pet.species AND COALESCE(bp.resource_id,other.resource_id)=target.id AND d::date>=(other.start_at AT TIME ZONE 'Africa/Johannesburg')::date AND d::date<COALESCE((other.end_at AT TIME ZONE 'Africa/Johannesburg')::date,(other.start_at AT TIME ZONE 'Africa/Johannesburg')::date+1)))) THEN RAISE EXCEPTION '% is full on one or more nights of this stay',target.name; END IF;
 END IF;
END IF;
RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.hotel_allocate_pet_room() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER hotel_allocate_pet_room BEFORE INSERT OR UPDATE OF resource_id,pet_id,booking_id ON public.booking_pets FOR EACH ROW EXECUTE FUNCTION public.hotel_allocate_pet_room();
-- Room-only moves do not affect the approved price or customer payment request.
CREATE OR REPLACE FUNCTION public.hotel_invalidate_approval() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE bid uuid; eid uuid; BEGIN
IF TG_TABLE_NAME='booking_pets' AND TG_OP='UPDATE' THEN IF NEW.pet_id IS NOT DISTINCT FROM OLD.pet_id AND NEW.booking_id IS NOT DISTINCT FROM OLD.booking_id AND NEW.accommodation_type IS NOT DISTINCT FROM OLD.accommodation_type AND NEW.rate_card_id IS NOT DISTINCT FROM OLD.rate_card_id THEN RETURN NEW; END IF; END IF;
IF TG_TABLE_NAME='bookings' THEN bid:=NEW.id; ELSE bid:=COALESCE(NEW.booking_id,OLD.booking_id); END IF;
SELECT estimate_id INTO eid FROM public.hotel_booking_reviews WHERE booking_id=bid AND verified_payment_id IS NULL;
IF eid IS NOT NULL THEN UPDATE public.estimates SET status='expired',hold_until=NULL,hold_expires_at=NULL WHERE id=eid AND converted_invoice_id IS NULL; END IF;
UPDATE public.hotel_booking_reviews SET approved_at=NULL,approved_by=NULL,estimate_id=NULL WHERE booking_id=bid AND verified_payment_id IS NULL;
UPDATE public.bookings SET status='requested',payment_hold_expires_at=NULL WHERE id=bid AND service_type IN ('hotel_dog','hotel_cat') AND invoice_id IS NULL AND status IN ('approved','pending_payment','confirmed');
IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF; END $$;
CREATE OR REPLACE FUNCTION public.hotel_check_room_dates() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN
IF NEW.service_type IN ('hotel_dog','hotel_cat') AND NEW.status NOT IN ('cancelled','no_show','completed','checked_out') THEN UPDATE public.booking_pets SET resource_id=resource_id WHERE booking_id=NEW.id; END IF; RETURN NEW; END $$;
REVOKE ALL ON FUNCTION public.hotel_check_room_dates() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER hotel_check_room_dates AFTER UPDATE OF start_at,end_at,status ON public.bookings FOR EACH ROW WHEN (OLD.start_at IS DISTINCT FROM NEW.start_at OR OLD.end_at IS DISTINCT FROM NEW.end_at OR OLD.status IS DISTINCT FROM NEW.status) EXECUTE FUNCTION public.hotel_check_room_dates();
-- Backfill only compatible legacy room assignments; leave full/unassigned stays for staff review.
UPDATE public.booking_pets bp SET resource_id=r.id FROM public.bookings b,public.pets p,public.resources r WHERE bp.booking_id=b.id AND bp.pet_id=p.id AND bp.resource_id IS NULL AND b.resource_id=r.id AND b.service_type IN ('hotel_dog','hotel_cat') AND r.tenant_id=b.tenant_id AND r.active AND r.type::text=CASE WHEN p.species='cat' THEN 'cattery_area' ELSE 'hotel_area' END AND (r.capacity IS NULL OR b.status IN ('cancelled','no_show','completed','checked_out'));
