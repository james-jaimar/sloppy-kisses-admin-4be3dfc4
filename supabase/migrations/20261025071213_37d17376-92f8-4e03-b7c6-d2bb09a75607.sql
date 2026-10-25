DO $m$ DECLARE d text; BEGIN
SELECT pg_get_functiondef('hotel_private.hotel_review_action(uuid,text,jsonb)'::regprocedure) INTO d;
d:=replace(d,'OR pay.amount<=0 OR EXISTS','OR pay.status<>''received'' OR COALESCE(pay.amount_refunded,0)<>0 OR pay.invoice_id IS NOT NULL OR pay.amount<=0 OR EXISTS');
d:=replace(d,'LEAST(pay.amount,total)','total');
d:=replace(d,'IF pay.amount<required THEN','IF pay.amount>total THEN RAISE EXCEPTION ''Receipt exceeds this pro forma total; record the excess separately as customer credit''; END IF;
 IF pay.amount<required THEN');
d:=replace(d,'jsonb_build_object(''invoice_id'',inv,''amount'',total)','jsonb_build_object(''invoice_id'',inv,''amount'',pay.amount)'); EXECUTE d;
SELECT pg_get_functiondef('public.hotel_invalidate_approval()'::regprocedure) INTO d; d:=replace(d,'IF TG_OP=''DELETE'' THEN','UPDATE public.bookings SET status=''requested'',payment_hold_expires_at=NULL WHERE id=bid AND service_type IN (''hotel_dog'',''hotel_cat'') AND invoice_id IS NULL AND status IN (''approved'',''pending_payment'',''confirmed''); IF TG_OP=''DELETE'' THEN'); EXECUTE d;
SELECT pg_get_functiondef('public.accept_estimate(uuid)'::regprocedure) INTO d;
d:=replace(d,'IF v_e.booking_id IS NOT NULL THEN RETURN v_e.booking_id; END IF;','IF v_e.status IN (''expired'',''cancelled'') THEN RAISE EXCEPTION ''This estimate is no longer valid''; END IF; IF v_e.booking_id IS NOT NULL THEN RETURN v_e.booking_id; END IF;');
d:=replace(d,'surcharge_id, quantity)','surcharge_id, quantity,quantity_basis)');
d:=replace(d,'COALESCE((v_s->>''quantity'')::numeric, 1));','COALESCE((v_s->>''quantity'')::numeric, 1),COALESCE(v_s->>''quantity_basis'',''catalog''));'); EXECUTE d;
END $m$;