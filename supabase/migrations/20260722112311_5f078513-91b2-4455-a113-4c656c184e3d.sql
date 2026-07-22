
-- 1. Unique partial index: a booking can only be linked to one request
CREATE UNIQUE INDEX IF NOT EXISTS booking_requests_converted_booking_unique
  ON public.booking_requests (converted_booking_id)
  WHERE converted_booking_id IS NOT NULL;

-- 2. Log status transitions to activity_log
CREATE OR REPLACE FUNCTION public.booking_requests_log_status_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid;
  v_title text;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN
    BEGIN
      SELECT id INTO v_actor FROM public.profiles WHERE user_id = auth.uid() LIMIT 1;
    EXCEPTION WHEN OTHERS THEN
      v_actor := NULL;
    END;

    v_title := CASE NEW.status::text
      WHEN 'converted' THEN 'Booking request converted'
      WHEN 'declined'  THEN 'Booking request declined'
      WHEN 'needs_info' THEN 'Booking request needs info'
      WHEN 'approved'  THEN 'Booking request approved'
      ELSE 'Booking request status changed'
    END;

    INSERT INTO public.activity_log(
      tenant_id, actor_profile_id, customer_id, booking_id,
      activity_type, title, description, metadata
    )
    VALUES (
      NEW.tenant_id, v_actor, NEW.customer_id, NEW.converted_booking_id,
      'booking_request_status_changed',
      v_title,
      COALESCE(NEW.admin_notes, NULL),
      jsonb_build_object(
        'booking_request_id', NEW.id,
        'service_type', NEW.service_type,
        'from', OLD.status,
        'to', NEW.status
      )
    );
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS booking_requests_log_status_change_trg ON public.booking_requests;
CREATE TRIGGER booking_requests_log_status_change_trg
  AFTER UPDATE ON public.booking_requests
  FOR EACH ROW EXECUTE FUNCTION public.booking_requests_log_status_change();
