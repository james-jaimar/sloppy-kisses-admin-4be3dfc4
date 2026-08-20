ALTER TYPE public.booking_status ADD VALUE IF NOT EXISTS 'pending_payment';

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS payment_hold_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS released_at timestamptz,
  ADD COLUMN IF NOT EXISTS release_reason text;

ALTER TABLE public.hotel_workflow_settings
  ADD COLUMN IF NOT EXISTS require_payment_to_confirm boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS payment_hold_hours integer NOT NULL DEFAULT 48;

ALTER TABLE public.grooming_workflow_settings
  ADD COLUMN IF NOT EXISTS require_payment_to_confirm boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS payment_hold_hours integer NOT NULL DEFAULT 48;

ALTER TABLE public.transport_workflow_settings
  ADD COLUMN IF NOT EXISTS require_payment_to_confirm boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS payment_hold_hours integer NOT NULL DEFAULT 48;

CREATE INDEX IF NOT EXISTS bookings_payment_hold_idx
  ON public.bookings (payment_hold_expires_at)
  WHERE payment_hold_expires_at IS NOT NULL;

-- Which services are payment gated, and with what hold window.
CREATE OR REPLACE FUNCTION public.booking_payment_gate(p_tenant uuid, p_service text)
RETURNS TABLE(gated boolean, hold_hours integer)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF p_service IN ('hotel_dog', 'hotel_cat') THEN
    RETURN QUERY
      SELECT COALESCE(s.require_payment_to_confirm, true), COALESCE(NULLIF(s.payment_hold_hours, 0), 48)
        FROM public.hotel_workflow_settings s WHERE s.tenant_id = p_tenant;
  ELSIF p_service IN ('grooming_inhouse', 'grooming_mobile') THEN
    RETURN QUERY
      SELECT COALESCE(s.require_payment_to_confirm, true), COALESCE(NULLIF(s.payment_hold_hours, 0), 48)
        FROM public.grooming_workflow_settings s WHERE s.tenant_id = p_tenant;
  ELSIF p_service = 'pickup_dropoff' THEN
    RETURN QUERY
      SELECT COALESCE(s.require_payment_to_confirm, true), COALESCE(NULLIF(s.payment_hold_hours, 0), 48)
        FROM public.transport_workflow_settings s WHERE s.tenant_id = p_tenant;
  ELSE
    RETURN QUERY SELECT false, 48;
    RETURN;
  END IF;

  IF NOT FOUND THEN
    RETURN QUERY SELECT true, 48;
  END IF;
END;
$$;

-- Has enough money landed to confirm? Deposit when one is set, otherwise the full amount.
CREATE OR REPLACE FUNCTION public.booking_payment_satisfied(p_booking_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_inv uuid;
  v_total numeric(12,2);
  v_paid numeric(12,2);
  v_dep numeric(12,2);
  v_required numeric(12,2);
BEGIN
  SELECT invoice_id INTO v_inv FROM public.bookings WHERE id = p_booking_id;
  IF v_inv IS NULL THEN RETURN false; END IF;

  SELECT COALESCE(total, 0), COALESCE(amount_paid, 0), COALESCE(deposit_due, 0)
    INTO v_total, v_paid, v_dep
    FROM public.invoices WHERE id = v_inv;

  IF v_total IS NULL OR v_total <= 0 THEN RETURN false; END IF;

  v_required := CASE WHEN v_dep > 0 THEN LEAST(v_dep, v_total) ELSE v_total END;
  RETURN v_paid >= v_required - 0.005;
END;
$$;

-- Hold instead of confirm while the money is outstanding.
CREATE OR REPLACE FUNCTION public.bookings_payment_gate()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_gated boolean;
  v_hours integer;
BEGIN
  IF NEW.status::text <> 'confirmed' THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.status::text = 'confirmed' THEN RETURN NEW; END IF;
  IF COALESCE(NEW.deposit_waived, false) THEN RETURN NEW; END IF;

  SELECT g.gated, g.hold_hours INTO v_gated, v_hours
    FROM public.booking_payment_gate(NEW.tenant_id, NEW.service_type::text) g;

  IF NOT COALESCE(v_gated, false) THEN RETURN NEW; END IF;
  IF public.booking_payment_satisfied(NEW.id) THEN
    NEW.payment_hold_expires_at := NULL;
    RETURN NEW;
  END IF;

  NEW.status := 'pending_payment'::public.booking_status;
  NEW.payment_hold_expires_at := COALESCE(NEW.payment_hold_expires_at, now() + make_interval(hours => COALESCE(v_hours, 48)));
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS bookings_payment_gate_trg ON public.bookings;
CREATE TRIGGER bookings_payment_gate_trg
  BEFORE INSERT OR UPDATE OF status ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.bookings_payment_gate();

-- Money lands -> promote held bookings on that invoice.
CREATE OR REPLACE FUNCTION public.invoices_release_payment_holds()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF COALESCE(NEW.amount_paid, 0) <= COALESCE(OLD.amount_paid, 0) THEN RETURN NEW; END IF;

  UPDATE public.bookings b
     SET status = 'confirmed'::public.booking_status,
         payment_hold_expires_at = NULL
   WHERE b.invoice_id = NEW.id
     AND b.status::text = 'pending_payment'
     AND public.booking_payment_satisfied(b.id);

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS invoices_release_payment_holds_trg ON public.invoices;
CREATE TRIGGER invoices_release_payment_holds_trg
  AFTER UPDATE OF amount_paid ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.invoices_release_payment_holds();

-- Hourly sweep: cancel bookings whose unpaid hold has expired, and void their invoice.
CREATE OR REPLACE FUNCTION public.release_expired_payment_holds()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  r record;
  v_count integer := 0;
BEGIN
  FOR r IN
    SELECT id, invoice_id
      FROM public.bookings
     WHERE status::text = 'pending_payment'
       AND payment_hold_expires_at IS NOT NULL
       AND payment_hold_expires_at < now()
  LOOP
    IF public.booking_payment_satisfied(r.id) THEN
      UPDATE public.bookings
         SET status = 'confirmed'::public.booking_status, payment_hold_expires_at = NULL
       WHERE id = r.id;
      CONTINUE;
    END IF;

    UPDATE public.bookings
       SET status = 'cancelled'::public.booking_status,
           released_at = now(),
           release_reason = 'unpaid_hold_expired',
           cancellation_reason = COALESCE(cancellation_reason, 'Auto-released: payment not received before the hold expired'),
           cancellation_fee_waived = true,
           payment_hold_expires_at = NULL
     WHERE id = r.id;

    IF r.invoice_id IS NOT NULL THEN
      UPDATE public.invoices i
         SET status = 'cancelled'::billing_status
       WHERE i.id = r.invoice_id
         AND COALESCE(i.amount_paid, 0) <= 0
         AND i.status::text NOT IN ('paid', 'cancelled')
         AND NOT EXISTS (
           SELECT 1 FROM public.bookings b2
            WHERE b2.invoice_id = i.id
              AND b2.id <> r.id
              AND b2.status::text <> 'cancelled'
         );
    END IF;

    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.release_expired_payment_holds() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.release_expired_payment_holds() TO service_role;
GRANT EXECUTE ON FUNCTION public.booking_payment_gate(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.booking_payment_satisfied(uuid) TO authenticated, service_role;

SELECT cron.unschedule('release-expired-payment-holds')
 WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'release-expired-payment-holds');

SELECT cron.schedule('release-expired-payment-holds', '5 * * * *',
  $cron$SELECT public.release_expired_payment_holds();$cron$);