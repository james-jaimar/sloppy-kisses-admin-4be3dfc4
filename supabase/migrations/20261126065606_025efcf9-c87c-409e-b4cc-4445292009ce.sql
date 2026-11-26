DO $patch$
DECLARE d text; old text;
BEGIN
 d:=pg_get_functiondef('public.schedule_hotel_groom(uuid,timestamptz,timestamptz,uuid,uuid,text)'::regprocedure);
 old:='SELECT * INTO v_r FROM public.hotel_grooming_requests WHERE id = p_request_id;';
 IF strpos(d,old)=0 THEN RAISE EXCEPTION 'Scheduling request layout changed'; END IF;
 d:=replace(d,old,'SELECT * INTO v_r FROM public.hotel_grooming_requests WHERE id = p_request_id FOR UPDATE;');
 old:='start_at, end_at, start_date, end_date, resource_id, notes_internal)';
 IF strpos(d,old)=0 THEN RAISE EXCEPTION 'Scheduling insert layout changed'; END IF;
 d:=replace(d,old,'start_at, end_at, start_date, end_date, resource_id, parent_booking_id, notes_internal)');
 d:=replace(d,'p_resource_id,'||E'\n    ''Hotel guest groom','p_resource_id, v_hotel.id,'||E'\n    ''Hotel guest groom');
 IF strpos(d,'p_resource_id, v_hotel.id,')=0 THEN RAISE EXCEPTION 'Scheduling parent link missing'; END IF;
 EXECUTE d;

 d:=pg_get_functiondef('public.ensure_booking_invoice(uuid)'::regprocedure);
 old:='IF b.invoice_id IS NOT NULL THEN RETURN b.invoice_id; END IF;';
 IF strpos(d,old)=0 THEN RAISE EXCEPTION 'Invoice guard layout changed'; END IF;
 d:=replace(d,old,old||E'\n  -- Unconfirmed hotel guest grooms belong to the combined stay, not a separate invoice.\n  IF b.service_type=''grooming_inhouse'' AND EXISTS (SELECT 1 FROM public.bookings h WHERE h.id=b.parent_booking_id AND h.tenant_id=b.tenant_id AND h.customer_id=b.customer_id AND h.service_type IN (''hotel_dog'',''hotel_cat'') AND h.invoice_id IS NULL) THEN RETURN NULL; END IF;');
 EXECUTE d;

 d:=pg_get_functiondef('public.create_checkout_groom(uuid,uuid,uuid,time without time zone)'::regprocedure);
 old:='start_at, end_at, start_date, end_date, notes_internal)';
 IF strpos(d,old)=0 THEN RAISE EXCEPTION 'Checkout insert layout changed'; END IF;
 d:=replace(d,old,'start_at, end_at, start_date, end_date, parent_booking_id, notes_internal)');
 d:=replace(d,'v_start, v_start + make_interval(mins => v_mins), v_day, v_day,','v_start, v_start + make_interval(mins => v_mins), v_day, v_day, v_h.id,');
 d:=replace(d,'status, grooming_booking_id, scheduled_at, customer_notes)','status, grooming_booking_id, scheduled_at, package_id, customer_notes)');
 d:=replace(d,'''scheduled'', v_id, v_start, ''Checkout-day groom','''scheduled'', v_id, v_start, v_pkg.id, ''Checkout-day groom');
 IF strpos(d,'v_start, v_pkg.id,')=0 THEN RAISE EXCEPTION 'Checkout package link missing'; END IF;
 EXECUTE d;

 d:=pg_get_functiondef('public.hotel_groom_requests_quote_sync()'::regprocedure);
 d:=replace(d,'AND (e.status::text<>''accepted'' OR COALESCE(e.created_via,'''')=''hotel_sheet_import'');',';');
 EXECUTE d;
END $patch$;

CREATE OR REPLACE FUNCTION public.estimates_mark_billed_grooms()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
 UPDATE public.hotel_grooming_requests gr SET billed_invoice_id=NEW.converted_invoice_id
 WHERE gr.id IN (SELECT ei.source_id FROM public.estimate_items ei WHERE ei.estimate_id=NEW.id AND ei.source_type='hotel_groom')
 AND gr.billed_invoice_id IS NULL;
 -- An appointment may have been scheduled while the stay was still a quote.
 -- Attach it now, but never replace a pre-existing separate invoice.
 UPDATE public.bookings gb SET invoice_id=NEW.converted_invoice_id,parent_booking_id=NEW.booking_id
 FROM public.hotel_grooming_requests gr
 WHERE gr.hotel_booking_id=NEW.booking_id AND gr.tenant_id=NEW.tenant_id
 AND gr.billed_invoice_id=NEW.converted_invoice_id AND gr.grooming_booking_id=gb.id
 AND gb.tenant_id=NEW.tenant_id AND gb.customer_id=NEW.customer_id AND gb.invoice_id IS NULL;
 RETURN NEW;
END $$;