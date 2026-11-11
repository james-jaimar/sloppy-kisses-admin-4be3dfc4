DO $migration$
DECLARE d text;
BEGIN
 SELECT pg_get_functiondef('hotel_private.hotel_review_action(uuid,text,jsonb)'::regprocedure) INTO d;
 IF strpos(d,'IF r.estimate_id IS NOT NULL THEN UPDATE public.estimates SET status=''expired''')=0 THEN RAISE EXCEPTION 'Expected hotel save branch not found'; END IF;
 d := replace(d,
 'IF r.estimate_id IS NOT NULL THEN UPDATE public.estimates SET status=''expired'',hold_until=NULL,hold_expires_at=NULL WHERE id=r.estimate_id AND converted_invoice_id IS NULL; END IF;',
 'IF r.estimate_id IS NOT NULL THEN UPDATE public.estimates SET status=''expired'',hold_until=NULL,hold_expires_at=NULL WHERE id=r.estimate_id AND converted_invoice_id IS NULL AND status<>''accepted''; END IF;');
 d := replace(d,'estimate_id=NULL,approved_at=NULL,approved_by=NULL WHERE booking_id=b.id;',
 'estimate_id=CASE WHEN EXISTS(SELECT 1 FROM public.estimates et WHERE et.id=r.estimate_id AND et.status=''accepted'') THEN r.estimate_id ELSE NULL END,approved_at=NULL,approved_by=NULL WHERE booking_id=b.id;');
 d := replace(d,'status=CASE WHEN p_action=''needs_info'' THEN ''needs_info''::public.booking_status ELSE ''requested''::public.booking_status END WHERE id=b.id;',
 'status=CASE WHEN p_action=''needs_info'' OR EXISTS(SELECT 1 FROM public.estimates et WHERE et.id=r.estimate_id AND et.status=''accepted'') THEN ''needs_info''::public.booking_status ELSE ''requested''::public.booking_status END WHERE id=b.id;');
 EXECUTE d;
END $migration$;