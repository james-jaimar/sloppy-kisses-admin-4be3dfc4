CREATE OR REPLACE FUNCTION public.grooming_enforce_travel_fee()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_service public.service_type;
  v_default numeric(12,2);
BEGIN
  SELECT service_type INTO v_service FROM public.bookings WHERE id = NEW.booking_id;
  IF v_service = 'grooming_mobile' THEN
    IF COALESCE(NEW.travel_fee, 0) = 0 THEN
      SELECT COALESCE(default_mobile_travel_fee_zar, 0) INTO v_default
      FROM public.grooming_workflow_settings WHERE tenant_id = NEW.tenant_id LIMIT 1;
      NEW.travel_fee := COALESCE(v_default, 0);
    END IF;
  ELSE
    NEW.travel_fee := 0;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_grooming_enforce_travel_fee ON public.grooming_booking_details;
CREATE TRIGGER trg_grooming_enforce_travel_fee
BEFORE INSERT OR UPDATE ON public.grooming_booking_details
FOR EACH ROW EXECUTE FUNCTION public.grooming_enforce_travel_fee();

-- When a booking switches to/from mobile grooming, re-evaluate the details row.
CREATE OR REPLACE FUNCTION public.bookings_resync_grooming_travel_fee()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.service_type IS DISTINCT FROM OLD.service_type THEN
    UPDATE public.grooming_booking_details
       SET travel_fee = CASE WHEN NEW.service_type = 'grooming_mobile' THEN 0 ELSE travel_fee END
     WHERE booking_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_bookings_resync_grooming_travel_fee ON public.bookings;
CREATE TRIGGER trg_bookings_resync_grooming_travel_fee
AFTER UPDATE OF service_type ON public.bookings
FOR EACH ROW EXECUTE FUNCTION public.bookings_resync_grooming_travel_fee();

REVOKE ALL ON FUNCTION public.grooming_enforce_travel_fee() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.bookings_resync_grooming_travel_fee() FROM PUBLIC, anon, authenticated;

-- Retire the duplicate optional travel add-ons so travel can't be double-billed.
UPDATE public.grooming_addons SET active = false WHERE code IN ('travel_mobile', 'mobile_travel');

-- Backfill open mobile grooming bookings.
UPDATE public.grooming_booking_details d
   SET travel_fee = COALESCE(w.default_mobile_travel_fee_zar, 0)
  FROM public.bookings b
  LEFT JOIN public.grooming_workflow_settings w ON w.tenant_id = b.tenant_id
 WHERE d.booking_id = b.id
   AND b.service_type = 'grooming_mobile'
   AND COALESCE(d.travel_fee, 0) = 0
   AND (b.invoice_id IS NULL OR NOT public._invoice_locked(b.invoice_id));