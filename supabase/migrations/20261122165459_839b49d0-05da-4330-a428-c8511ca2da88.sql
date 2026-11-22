DO $migration$
DECLARE d text;
BEGIN
 SELECT pg_get_functiondef('public.schedule_hotel_groom(uuid,timestamptz,timestamptz,uuid,uuid,text)'::regprocedure) INTO d;
 IF strpos(d,'v_minutes integer;')=0 OR strpos(d,'SELECT * INTO v_hotel FROM public.bookings WHERE id = v_r.hotel_booking_id;')=0 THEN RAISE EXCEPTION 'Groom scheduling anchors missing'; END IF;
 d:=replace(d,'v_minutes integer;','v_minutes integer; legacy_billed boolean:=false; legacy_auto boolean;');
 d:=replace(d,'SELECT * INTO v_hotel FROM public.bookings WHERE id = v_r.hotel_booking_id;',$branch$
 SELECT * INTO v_hotel FROM public.bookings WHERE id = v_r.hotel_booking_id;
 SELECT EXISTS(SELECT 1 FROM public.estimates e WHERE e.booking_id=v_hotel.id AND e.tenant_id=v_r.tenant_id AND e.created_via='hotel_sheet_import' AND (e.extras->'legacy_hotel_import'->'billed_groom_pet_ids') ? v_r.pet_id::text) INTO legacy_billed;
 IF legacy_billed THEN
   IF v_hotel.invoice_id IS NULL THEN RAISE EXCEPTION 'This groom is included in the imported hotel quote; confirm the hotel invoice before scheduling it'; END IF;
   IF cardinality(coalesce(v_r.addon_ids,'{}'::uuid[]))>0 THEN RAISE EXCEPTION 'This imported groom is already billed; review any new extras separately before scheduling'; END IF;
   SELECT auto_invoice_grooming INTO legacy_auto FROM public.invoicing_settings WHERE tenant_id=v_r.tenant_id FOR UPDATE;
   UPDATE public.invoicing_settings SET auto_invoice_grooming=false WHERE tenant_id=v_r.tenant_id;
 END IF;
$branch$);
 d:=replace(d,'  INSERT INTO public.booking_pets(tenant_id, booking_id, pet_id)',$branch$
 IF legacy_billed THEN
   UPDATE public.bookings SET invoice_id=v_hotel.invoice_id,parent_booking_id=v_hotel.id,
    notes_internal=coalesce(notes_internal,'')||E'\nGroom already included in imported hotel invoice; no additional charge.' WHERE id=v_booking_id;
 END IF;
  INSERT INTO public.booking_pets(tenant_id, booking_id, pet_id)
$branch$);
 d:=replace(d,'  RETURN v_booking_id;',$branch$
 IF legacy_billed THEN UPDATE public.invoicing_settings SET auto_invoice_grooming=legacy_auto WHERE tenant_id=v_r.tenant_id; END IF;
  RETURN v_booking_id;
$branch$);
 EXECUTE d;
 SELECT pg_get_functiondef('public.create_checkout_groom(uuid,uuid,uuid,time)'::regprocedure) INTO d;
 d:=replace(d,'  SELECT * INTO v_pkg FROM public.grooming_packages',$branch$
 IF EXISTS(SELECT 1 FROM public.estimates e WHERE e.booking_id=v_h.id AND e.created_via='hotel_sheet_import' AND (e.extras->'legacy_hotel_import'->'billed_groom_pet_ids') ? p_pet_id::text) THEN
   RAISE EXCEPTION 'This groom is already included in the imported hotel bill; staff should schedule its existing hotel grooming request';
 END IF;
  SELECT * INTO v_pkg FROM public.grooming_packages
$branch$);
 EXECUTE d;
END $migration$;