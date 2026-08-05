CREATE OR REPLACE FUNCTION public.bookings_notify_changes()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_status public.notification_status;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_status := coalesce(public._customer_notify_status(NEW.customer_id), 'skipped');
    INSERT INTO public.notification_events(tenant_id, event_type, booking_id, customer_id, payload, status)
    VALUES (NEW.tenant_id, 'booking_created'::public.notification_event_type, NEW.id, NEW.customer_id,
      jsonb_build_object('booking_number', NEW.booking_number, 'status', NEW.status, 'start_at', NEW.start_at, 'end_at', NEW.end_at),
      v_status);
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    v_status := coalesce(public._customer_notify_status(NEW.customer_id), 'skipped');

    IF NEW.status IS DISTINCT FROM OLD.status THEN
      INSERT INTO public.notification_events(tenant_id, event_type, booking_id, customer_id, payload, status)
      VALUES (NEW.tenant_id,
        (CASE WHEN NEW.status = 'cancelled' THEN 'booking_cancelled'
              ELSE 'booking_status_changed' END)::public.notification_event_type,
        NEW.id, NEW.customer_id,
        jsonb_build_object('booking_number', NEW.booking_number, 'from', OLD.status, 'to', NEW.status),
        v_status);
    END IF;

    IF NEW.start_at IS DISTINCT FROM OLD.start_at OR NEW.end_at IS DISTINCT FROM OLD.end_at THEN
      INSERT INTO public.notification_events(tenant_id, event_type, booking_id, customer_id, payload, status)
      VALUES (NEW.tenant_id, 'booking_rescheduled'::public.notification_event_type, NEW.id, NEW.customer_id,
        jsonb_build_object('booking_number', NEW.booking_number,
          'from_start', OLD.start_at, 'to_start', NEW.start_at,
          'from_end', OLD.end_at, 'to_end', NEW.end_at),
        v_status);
    END IF;

    RETURN NEW;
  END IF;

  RETURN NEW;
END $function$;