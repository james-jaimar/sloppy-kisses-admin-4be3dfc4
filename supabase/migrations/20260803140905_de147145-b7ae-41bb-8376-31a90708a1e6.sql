
CREATE TABLE IF NOT EXISTS public.stay_play_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  booking_id uuid REFERENCES public.bookings(id) ON DELETE CASCADE,
  pet_id uuid NOT NULL REFERENCES public.pets(id) ON DELETE CASCADE,
  customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  session_date date NOT NULL,
  origin text NOT NULL DEFAULT 'grooming',
  status text NOT NULL DEFAULT 'awaiting',
  expected_collect_at timestamptz,
  collected_at timestamptz,
  collected_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (booking_id, pet_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.stay_play_sessions TO authenticated;
GRANT ALL ON public.stay_play_sessions TO service_role;

ALTER TABLE public.stay_play_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY stay_play_sessions_staff_all ON public.stay_play_sessions
  FOR ALL TO authenticated
  USING (public.user_has_tenant_access(tenant_id))
  WITH CHECK (public.user_has_tenant_access(tenant_id));

CREATE POLICY stay_play_sessions_customer_select_own ON public.stay_play_sessions
  FOR SELECT TO authenticated
  USING (customer_id = public.current_customer_id(tenant_id));

CREATE INDEX IF NOT EXISTS stay_play_sessions_tenant_date_idx
  ON public.stay_play_sessions (tenant_id, session_date);

CREATE TRIGGER stay_play_sessions_set_updated_at
  BEFORE UPDATE ON public.stay_play_sessions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.daycare_workflow_settings
  ADD COLUMN IF NOT EXISTS daily_capacity integer,
  ADD COLUMN IF NOT EXISTS stay_play_default_collect_time time NOT NULL DEFAULT '16:30',
  ADD COLUMN IF NOT EXISTS stay_play_grace_minutes integer NOT NULL DEFAULT 15;

-- Shared helper: create sessions for every pet on a booking
CREATE OR REPLACE FUNCTION public.stay_play_ensure_sessions(p_booking_id uuid, p_origin text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  b public.bookings%ROWTYPE;
  v_date date;
  v_time time;
BEGIN
  SELECT * INTO b FROM public.bookings WHERE id = p_booking_id;
  IF NOT FOUND THEN RETURN; END IF;

  IF p_origin = 'hotel' THEN
    v_date := COALESCE(b.end_date, (b.end_at AT TIME ZONE 'Africa/Johannesburg')::date, b.start_date, (b.start_at AT TIME ZONE 'Africa/Johannesburg')::date);
  ELSE
    v_date := COALESCE(b.start_date, (b.start_at AT TIME ZONE 'Africa/Johannesburg')::date);
  END IF;
  IF v_date IS NULL THEN RETURN; END IF;

  SELECT stay_play_default_collect_time INTO v_time
  FROM public.daycare_workflow_settings WHERE tenant_id = b.tenant_id;
  v_time := COALESCE(v_time, '16:30'::time);

  INSERT INTO public.stay_play_sessions (tenant_id, booking_id, pet_id, customer_id, session_date, origin, expected_collect_at)
  SELECT b.tenant_id, b.id, bp.pet_id, b.customer_id, v_date, p_origin,
         ((v_date + v_time) AT TIME ZONE 'Africa/Johannesburg')
  FROM public.booking_pets bp
  WHERE bp.booking_id = b.id
  ON CONFLICT (booking_id, pet_id) DO NOTHING;
END;
$$;

REVOKE ALL ON FUNCTION public.stay_play_ensure_sessions(uuid, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.stay_play_ensure_sessions(uuid, text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.grooming_addons_stay_play_sync()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.addon_code = 'stay_play_after' THEN
      DELETE FROM public.stay_play_sessions
      WHERE booking_id = OLD.booking_id AND origin = 'grooming' AND status = 'awaiting';
    END IF;
    RETURN OLD;
  END IF;
  IF NEW.addon_code = 'stay_play_after' THEN
    PERFORM public.stay_play_ensure_sessions(NEW.booking_id, 'grooming');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS grooming_addons_stay_play_sync_trg ON public.grooming_booking_addons;
CREATE TRIGGER grooming_addons_stay_play_sync_trg
  AFTER INSERT OR UPDATE OR DELETE ON public.grooming_booking_addons
  FOR EACH ROW EXECUTE FUNCTION public.grooming_addons_stay_play_sync();

CREATE OR REPLACE FUNCTION public.hotel_surcharge_stay_play_sync()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_code text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    SELECT code INTO v_code FROM public.hotel_surcharges WHERE id = OLD.surcharge_id;
    IF v_code = 'late_checkout' THEN
      DELETE FROM public.stay_play_sessions
      WHERE booking_id = OLD.booking_id AND origin = 'hotel' AND status = 'awaiting';
    END IF;
    RETURN OLD;
  END IF;
  SELECT code INTO v_code FROM public.hotel_surcharges WHERE id = NEW.surcharge_id;
  IF v_code = 'late_checkout' THEN
    PERFORM public.stay_play_ensure_sessions(NEW.booking_id, 'hotel');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS hotel_surcharge_stay_play_sync_trg ON public.hotel_booking_surcharges;
CREATE TRIGGER hotel_surcharge_stay_play_sync_trg
  AFTER INSERT OR UPDATE OR DELETE ON public.hotel_booking_surcharges
  FOR EACH ROW EXECUTE FUNCTION public.hotel_surcharge_stay_play_sync();
