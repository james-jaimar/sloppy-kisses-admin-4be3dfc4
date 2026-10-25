CREATE OR REPLACE FUNCTION public.bookings_payment_gate()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_gated boolean; v_hours integer;
BEGIN
  IF NEW.status::text <> 'confirmed' THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.status::text = 'confirmed' THEN RETURN NEW; END IF;
  IF COALESCE(NEW.deposit_waived, false) THEN RETURN NEW; END IF;
  -- Hotel stays confirmed by staff after info gathering are confirmed with an issued invoice; payment is tracked on the invoice.
  IF NEW.service_type::text IN ('hotel_dog','hotel_cat') AND EXISTS (SELECT 1 FROM public.hotel_booking_reviews r WHERE r.booking_id=NEW.id AND r.confirmed_at IS NOT NULL) THEN
    NEW.payment_hold_expires_at := NULL; RETURN NEW;
  END IF;
  SELECT g.gated, g.hold_hours INTO v_gated, v_hours FROM public.booking_payment_gate(NEW.tenant_id, NEW.service_type::text) g;
  IF NOT COALESCE(v_gated, false) THEN RETURN NEW; END IF;
  IF public.booking_payment_satisfied(NEW.id) THEN NEW.payment_hold_expires_at := NULL; RETURN NEW; END IF;
  NEW.status := 'pending_payment'::public.booking_status;
  NEW.payment_hold_expires_at := COALESCE(NEW.payment_hold_expires_at, now() + make_interval(hours => COALESCE(v_hours, 48)));
  RETURN NEW;
END;
$function$;