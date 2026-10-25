DO $migration$
DECLARE definition text; old_branch text := 'IF v_e.booking_id IS NOT NULL THEN RETURN v_e.booking_id; END IF;'; new_branch text := $branch$
IF v_e.booking_id IS NOT NULL THEN
  IF v_e.service_type IN ('hotel_dog','hotel_cat') AND v_e.status <> 'accepted' THEN
    PERFORM 1 FROM public.bookings b
      WHERE b.id=v_e.booking_id AND b.tenant_id=v_e.tenant_id AND b.customer_id=v_e.customer_id
        AND b.service_type IN ('hotel_dog','hotel_cat') AND b.status NOT IN ('cancelled','no_show','completed','checked_out')
      FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'This hotel quote is no longer available'; END IF;
    UPDATE public.estimates SET status='accepted',accepted_at=COALESCE(accepted_at,now()),updated_at=now() WHERE id=v_e.id;
    UPDATE public.bookings SET status='needs_info',payment_hold_expires_at=NULL
      WHERE id=v_e.booking_id AND invoice_id IS NULL
        AND NOT EXISTS(SELECT 1 FROM public.hotel_booking_reviews r WHERE r.booking_id=v_e.booking_id AND r.confirmed_at IS NOT NULL);
  END IF;
  RETURN v_e.booking_id;
END IF;
$branch$;
BEGIN
 SELECT pg_get_functiondef('public.accept_estimate(uuid)'::regprocedure) INTO definition;
 IF strpos(definition,old_branch)=0 THEN RAISE EXCEPTION 'Expected linked quote branch not found'; END IF;
 definition:=replace(definition,'SELECT * INTO v_e FROM public.estimates WHERE id = p_estimate_id;','SELECT * INTO v_e FROM public.estimates WHERE id = p_estimate_id FOR UPDATE;');
 definition:=replace(definition,old_branch,new_branch);
 EXECUTE definition;
END $migration$;