ALTER POLICY hotel_reviews_staff ON public.hotel_booking_reviews USING (public.user_has_permission(tenant_id,'hotel.view') OR public.user_has_permission(tenant_id,'bookings.edit'));
DO $m$ DECLARE d text; BEGIN
SELECT pg_get_functiondef('public.hotel_details_auto_invoice()'::regprocedure) INTO d;
d:=replace(d,'IF v_booking.id IS NULL THEN RETURN NEW; END IF;', 'IF v_booking.id IS NULL THEN RETURN NEW; END IF; IF v_booking.invoice_id IS NULL AND NOT EXISTS (SELECT 1 FROM public.hotel_booking_reviews hr JOIN public.payments hp ON hp.id=hr.verified_payment_id WHERE hr.booking_id=v_booking.id AND hp.tenant_id=v_booking.tenant_id AND hp.customer_id=v_booking.customer_id AND hp.status=''received'' AND hp.amount>0 AND COALESCE(hp.amount_refunded,0)=0) THEN RETURN NEW; END IF;');
d:=replace(d,'FROM public.hotel_stay_lines_pets(NEW.tenant_id, v_species, v_start, v_end, v_pets);','FROM public.hotel_booking_stay_lines(v_booking.id);'); EXECUTE d;
SELECT pg_get_functiondef('public.ensure_booking_invoice(uuid)'::regprocedure) INTO d;
d:=replace(d,'WHERE r.booking_id=b.id AND p.amount>0','WHERE r.booking_id=b.id AND r.approved_at IS NOT NULL AND p.status=''received'' AND COALESCE(p.amount_refunded,0)=0 AND p.amount>0'); EXECUTE d;
END $m$;