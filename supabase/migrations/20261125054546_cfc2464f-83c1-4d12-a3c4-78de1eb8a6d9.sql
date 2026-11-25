CREATE OR REPLACE FUNCTION public.notification_events_resolve_recipient()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_email text; v_notify boolean;
BEGIN
  IF NEW.channel <> 'email' OR NEW.status <> 'pending' THEN RETURN NEW; END IF;
  IF NEW.customer_id IS NOT NULL THEN
    SELECT nullif(btrim(email), ''), notify_email INTO v_email, v_notify FROM public.customers WHERE id = NEW.customer_id;
    IF v_notify IS FALSE THEN
      NEW.status := 'skipped'; NEW.error := coalesce(NEW.error, 'Customer opted out of email');
      RETURN NEW;
    END IF;
  END IF;
  IF nullif(btrim(coalesce(NEW.recipient_email, '')), '') IS NULL THEN
    NEW.recipient_email := v_email;
  END IF;
  IF NEW.recipient_email IS NULL THEN
    NEW.status := 'skipped'; NEW.error := coalesce(NEW.error, 'No email address on file');
  END IF;
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.notification_events_resolve_recipient() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS notification_events_resolve_recipient ON public.notification_events;
CREATE TRIGGER notification_events_resolve_recipient BEFORE INSERT ON public.notification_events
FOR EACH ROW EXECUTE FUNCTION public.notification_events_resolve_recipient();

UPDATE public.notification_events e SET recipient_email = nullif(btrim(c.email), '')
FROM public.customers c
WHERE e.customer_id = c.id AND e.status = 'pending' AND e.channel = 'email' AND e.recipient_email IS NULL AND coalesce(c.notify_email, true);

UPDATE public.notification_events SET status = 'skipped', error = 'No email address on file'
WHERE status = 'pending' AND channel = 'email' AND recipient_email IS NULL;