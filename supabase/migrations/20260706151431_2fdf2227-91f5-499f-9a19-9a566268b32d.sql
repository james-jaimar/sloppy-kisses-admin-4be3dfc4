
-- 1. customer preference
ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS notify_email boolean NOT NULL DEFAULT true;

-- 2. event type enum
DO $$ BEGIN
  CREATE TYPE public.notification_event_type AS ENUM (
    'booking_created',
    'booking_rescheduled',
    'booking_cancelled',
    'booking_status_changed',
    'booking_request_created',
    'booking_request_status_changed'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.notification_status AS ENUM ('pending','sent','failed','skipped');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 3. queue table
CREATE TABLE IF NOT EXISTS public.notification_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  event_type public.notification_event_type NOT NULL,
  booking_id uuid REFERENCES public.bookings(id) ON DELETE SET NULL,
  booking_request_id uuid REFERENCES public.booking_requests(id) ON DELETE SET NULL,
  customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status public.notification_status NOT NULL DEFAULT 'pending',
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.notification_events TO authenticated;
GRANT ALL ON public.notification_events TO service_role;

ALTER TABLE public.notification_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant staff can view notification events"
  ON public.notification_events FOR SELECT TO authenticated
  USING (public.user_has_tenant_access(tenant_id));

CREATE POLICY "Tenant staff can manage notification events"
  ON public.notification_events FOR ALL TO authenticated
  USING (public.user_has_tenant_access(tenant_id))
  WITH CHECK (public.user_has_tenant_access(tenant_id));

CREATE INDEX IF NOT EXISTS notification_events_tenant_status_idx
  ON public.notification_events (tenant_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS notification_events_booking_idx
  ON public.notification_events (booking_id);
CREATE INDEX IF NOT EXISTS notification_events_booking_request_idx
  ON public.notification_events (booking_request_id);

-- 4. helper to check customer notify preference
CREATE OR REPLACE FUNCTION public._customer_notify_status(target_customer_id uuid)
RETURNS public.notification_status
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE
    WHEN c.notify_email IS TRUE AND (c.email IS NOT NULL AND length(c.email) > 0)
      THEN 'pending'::public.notification_status
    ELSE 'skipped'::public.notification_status
  END
  FROM public.customers c WHERE c.id = target_customer_id;
$$;

-- 5. bookings trigger
CREATE OR REPLACE FUNCTION public.bookings_notify_changes()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_status public.notification_status;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_status := coalesce(public._customer_notify_status(NEW.customer_id), 'skipped');
    INSERT INTO public.notification_events(tenant_id, event_type, booking_id, customer_id, payload, status)
    VALUES (NEW.tenant_id, 'booking_created', NEW.id, NEW.customer_id,
      jsonb_build_object('booking_number', NEW.booking_number, 'status', NEW.status, 'start_at', NEW.start_at, 'end_at', NEW.end_at),
      v_status);
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    v_status := coalesce(public._customer_notify_status(NEW.customer_id), 'skipped');

    IF NEW.status IS DISTINCT FROM OLD.status THEN
      INSERT INTO public.notification_events(tenant_id, event_type, booking_id, customer_id, payload, status)
      VALUES (NEW.tenant_id,
        CASE WHEN NEW.status = 'cancelled' THEN 'booking_cancelled'
             ELSE 'booking_status_changed' END,
        NEW.id, NEW.customer_id,
        jsonb_build_object('booking_number', NEW.booking_number, 'from', OLD.status, 'to', NEW.status),
        v_status);
    END IF;

    IF NEW.start_at IS DISTINCT FROM OLD.start_at OR NEW.end_at IS DISTINCT FROM OLD.end_at THEN
      INSERT INTO public.notification_events(tenant_id, event_type, booking_id, customer_id, payload, status)
      VALUES (NEW.tenant_id, 'booking_rescheduled', NEW.id, NEW.customer_id,
        jsonb_build_object('booking_number', NEW.booking_number,
          'from_start', OLD.start_at, 'to_start', NEW.start_at,
          'from_end', OLD.end_at, 'to_end', NEW.end_at),
        v_status);
    END IF;

    RETURN NEW;
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS bookings_notify_changes_trg ON public.bookings;
CREATE TRIGGER bookings_notify_changes_trg
  AFTER INSERT OR UPDATE ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.bookings_notify_changes();

-- 6. booking_requests trigger
CREATE OR REPLACE FUNCTION public.booking_requests_notify_changes()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_status public.notification_status;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_status := coalesce(public._customer_notify_status(NEW.customer_id), 'skipped');
    INSERT INTO public.notification_events(tenant_id, event_type, booking_request_id, customer_id, payload, status)
    VALUES (NEW.tenant_id, 'booking_request_created', NEW.id, NEW.customer_id,
      jsonb_build_object('status', NEW.status),
      v_status);
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN
    v_status := coalesce(public._customer_notify_status(NEW.customer_id), 'skipped');
    INSERT INTO public.notification_events(tenant_id, event_type, booking_request_id, customer_id, payload, status)
    VALUES (NEW.tenant_id, 'booking_request_status_changed', NEW.id, NEW.customer_id,
      jsonb_build_object('from', OLD.status, 'to', NEW.status),
      v_status);
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS booking_requests_notify_changes_trg ON public.booking_requests;
CREATE TRIGGER booking_requests_notify_changes_trg
  AFTER INSERT OR UPDATE ON public.booking_requests
  FOR EACH ROW EXECUTE FUNCTION public.booking_requests_notify_changes();
