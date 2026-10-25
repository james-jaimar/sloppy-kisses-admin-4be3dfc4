DO $m$ DECLARE d text; BEGIN
SELECT pg_get_functiondef('hotel_private.hotel_review_action(uuid,text,jsonb)'::regprocedure) INTO d;
d:=replace(d, 'IF p_action=''save'' OR p_action=''needs_info'' THEN', 'IF p_action=''record_receipt'' THEN
 IF NOT public.user_has_permission(b.tenant_id,''payments.create'') THEN RAISE EXCEPTION ''Payment recording permission required''; END IF;
 IF r.verified_payment_id IS NOT NULL THEN RETURN b.invoice_id; END IF;
 IF r.approved_at IS NULL OR (p_data->>''amount'')::numeric<=0 OR NULLIF(trim(p_data->>''reference''),'''') IS NULL THEN RAISE EXCEPTION ''Approve the stay and provide a received amount and bank/till reference''; END IF;
 INSERT INTO public.payments(tenant_id,customer_id,amount,payment_method,payment_reference,paid_at,status,recorded_by)
 VALUES(b.tenant_id,b.customer_id,(p_data->>''amount'')::numeric,(p_data->>''method'')::public.payment_method,p_data->>''reference'',now(),''received'',public.current_profile_id()) RETURNING * INTO pay;
 RETURN hotel_private.hotel_review_action(b.id,''receipt'',jsonb_build_object(''payment_id'',pay.id));
 END IF;
 IF p_action=''save'' OR p_action=''needs_info'' THEN');
d:=replace(d,'UPDATE public.bookings SET status=CASE WHEN p_action=''needs_info''', 'IF NULLIF(p_data->>''collection_time'','''') IS NOT NULL THEN UPDATE public.hotel_booking_details SET agreed_collection_time=(p_data->>''collection_time'')::time WHERE booking_id=b.id; END IF;
 UPDATE public.bookings SET status=CASE WHEN p_action=''needs_info''');
d:=replace(d,'IF pets_json IS NULL THEN RAISE EXCEPTION ''Link at least one pet''; END IF;', 'IF pets_json IS NULL THEN RAISE EXCEPTION ''Link at least one pet''; END IF;
 IF EXISTS(SELECT 1 FROM public.booking_pets bp JOIN public.pets p ON p.id=bp.pet_id WHERE bp.booking_id=b.id AND NOT EXISTS(SELECT 1 FROM public.hotel_rate_cards rc WHERE rc.tenant_id=b.tenant_id AND rc.active AND rc.species=p.species::text AND rc.accommodation_type=COALESCE(bp.accommodation_type,h.accommodation_type))) THEN RAISE EXCEPTION ''Every pet needs active accommodation matching its species''; END IF;');
EXECUTE d;
END $m$;
ALTER TABLE public.hotel_booking_details ADD COLUMN agreed_collection_time time;
CREATE FUNCTION public.hotel_invoice_no_duplicate() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN IF NEW.verified_payment_id IS NOT NULL AND OLD.verified_payment_id IS NULL AND EXISTS(SELECT 1 FROM public.bookings b WHERE b.id=NEW.booking_id AND b.invoice_id IS NOT NULL) THEN RAISE EXCEPTION 'This stay already has an invoice; allocate payment to that invoice instead'; END IF; RETURN NEW; END $$;
REVOKE ALL ON FUNCTION public.hotel_invoice_no_duplicate() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER hotel_invoice_no_duplicate BEFORE UPDATE ON public.hotel_booking_reviews FOR EACH ROW EXECUTE FUNCTION public.hotel_invoice_no_duplicate();