CREATE TABLE public.grooming_kiosk_staff (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  display_name text NOT NULL,
  pin_hash text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.grooming_kiosk_staff TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.grooming_kiosk_staff TO authenticated;
GRANT ALL ON public.grooming_kiosk_staff TO service_role;
REVOKE SELECT (pin_hash) ON public.grooming_kiosk_staff FROM authenticated;
REVOKE SELECT ON public.grooming_kiosk_staff FROM authenticated;
GRANT SELECT (id, tenant_id, display_name, active, created_at, updated_at) ON public.grooming_kiosk_staff TO authenticated;
REVOKE UPDATE ON public.grooming_kiosk_staff FROM authenticated;
GRANT UPDATE (display_name, active) ON public.grooming_kiosk_staff TO authenticated;
REVOKE INSERT ON public.grooming_kiosk_staff FROM authenticated;
GRANT INSERT (tenant_id, display_name, active) ON public.grooming_kiosk_staff TO authenticated;
ALTER TABLE public.grooming_kiosk_staff ENABLE ROW LEVEL SECURITY;
CREATE POLICY gks_select ON public.grooming_kiosk_staff FOR SELECT TO authenticated USING (public.user_has_tenant_access(tenant_id));
CREATE POLICY gks_insert ON public.grooming_kiosk_staff FOR INSERT TO authenticated WITH CHECK (public.user_has_permission(tenant_id, 'settings.grooming.manage'));
CREATE POLICY gks_update ON public.grooming_kiosk_staff FOR UPDATE TO authenticated USING (public.user_has_permission(tenant_id, 'settings.grooming.manage')) WITH CHECK (public.user_has_permission(tenant_id, 'settings.grooming.manage'));
CREATE POLICY gks_delete ON public.grooming_kiosk_staff FOR DELETE TO authenticated USING (public.user_has_permission(tenant_id, 'settings.grooming.manage'));
CREATE TRIGGER gks_updated_at BEFORE UPDATE ON public.grooming_kiosk_staff FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.grooming_booking_details
  ADD COLUMN IF NOT EXISTS started_by_kiosk_staff_id uuid REFERENCES public.grooming_kiosk_staff(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS finished_by_kiosk_staff_id uuid REFERENCES public.grooming_kiosk_staff(id) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION public.grooming_kiosk_set_pin(p_staff_id uuid, p_pin text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE v_tenant uuid;
BEGIN
  IF p_pin !~ '^[0-9]{4}$' THEN RAISE EXCEPTION 'PIN must be exactly 4 digits'; END IF;
  SELECT tenant_id INTO v_tenant FROM grooming_kiosk_staff WHERE id = p_staff_id;
  IF v_tenant IS NULL OR NOT user_has_permission(v_tenant, 'settings.grooming.manage') THEN RAISE EXCEPTION 'Not allowed'; END IF;
  IF EXISTS (SELECT 1 FROM grooming_kiosk_staff WHERE tenant_id = v_tenant AND id <> p_staff_id AND active AND pin_hash IS NOT NULL AND pin_hash = crypt(p_pin, pin_hash)) THEN
    RAISE EXCEPTION 'That PIN is already used by another groomer';
  END IF;
  UPDATE grooming_kiosk_staff SET pin_hash = crypt(p_pin, gen_salt('bf')) WHERE id = p_staff_id;
END $$;

CREATE OR REPLACE FUNCTION public.grooming_kiosk_has_pin(p_tenant uuid)
RETURNS TABLE(id uuid, has_pin boolean) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT s.id, s.pin_hash IS NOT NULL FROM grooming_kiosk_staff s WHERE s.tenant_id = p_tenant AND user_has_tenant_access(p_tenant);
$$;

CREATE OR REPLACE FUNCTION public._grooming_kiosk_find(p_tenant uuid, p_pin text)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, extensions AS $$
  SELECT id FROM grooming_kiosk_staff WHERE tenant_id = p_tenant AND active AND pin_hash IS NOT NULL AND pin_hash = crypt(p_pin, pin_hash) LIMIT 1;
$$;
REVOKE ALL ON FUNCTION public._grooming_kiosk_find(uuid, text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.grooming_kiosk_verify_pin(p_tenant uuid, p_pin text)
RETURNS TABLE(id uuid, display_name text) LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v uuid;
BEGIN
  IF NOT user_has_tenant_access(p_tenant) THEN RAISE EXCEPTION 'Not allowed'; END IF;
  v := _grooming_kiosk_find(p_tenant, p_pin);
  RETURN QUERY SELECT s.id, s.display_name FROM grooming_kiosk_staff s WHERE s.id = v;
END $$;

CREATE OR REPLACE FUNCTION public.grooming_kiosk_action(p_booking_id uuid, p_pin text, p_action text, p_notes text DEFAULT NULL)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_tenant uuid; v_staff uuid; v_name text; v_status booking_status;
BEGIN
  SELECT tenant_id, status INTO v_tenant, v_status FROM bookings WHERE id = p_booking_id AND service_type = 'grooming_inhouse';
  IF v_tenant IS NULL OR NOT user_has_tenant_access(v_tenant) THEN RAISE EXCEPTION 'Not allowed'; END IF;
  v_staff := _grooming_kiosk_find(v_tenant, p_pin);
  IF v_staff IS NULL THEN RAISE EXCEPTION 'PIN not recognised'; END IF;
  SELECT display_name INTO v_name FROM grooming_kiosk_staff WHERE id = v_staff;

  IF p_action = 'start' THEN
    IF v_status IN ('cancelled','no_show','checked_out','completed','ready') THEN RAISE EXCEPTION 'This groom can''t be started'; END IF;
    UPDATE bookings SET status = 'grooming' WHERE id = p_booking_id;
    UPDATE grooming_booking_details SET actual_start_at = COALESCE(actual_start_at, now()),
      started_by_kiosk_staff_id = v_staff, groomer_name = v_name WHERE booking_id = p_booking_id;
  ELSIF p_action = 'finish' THEN
    IF v_status NOT IN ('grooming','in_progress') THEN RAISE EXCEPTION 'Start the groom first'; END IF;
    UPDATE bookings SET status = 'ready' WHERE id = p_booking_id;
    UPDATE grooming_booking_details SET actual_end_at = COALESCE(actual_end_at, now()),
      finished_by_kiosk_staff_id = v_staff,
      grooming_notes = CASE WHEN COALESCE(btrim(p_notes),'') = '' THEN grooming_notes
        ELSE concat_ws(E'\n', NULLIF(grooming_notes,''), v_name || ': ' || btrim(p_notes)) END
      WHERE booking_id = p_booking_id;
  ELSE RAISE EXCEPTION 'Unknown action';
  END IF;
  INSERT INTO booking_status_events(tenant_id, booking_id, to_status, event_kind, note)
  VALUES (v_tenant, p_booking_id, CASE WHEN p_action='start' THEN 'grooming'::booking_status ELSE 'ready'::booking_status END,
          'kiosk_' || p_action, v_name || COALESCE(' — ' || NULLIF(btrim(p_notes),''), ''));
  RETURN v_name;
END $$;

REVOKE ALL ON FUNCTION public.grooming_kiosk_set_pin(uuid,text), public.grooming_kiosk_has_pin(uuid), public.grooming_kiosk_verify_pin(uuid,text), public.grooming_kiosk_action(uuid,text,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.grooming_kiosk_set_pin(uuid,text), public.grooming_kiosk_has_pin(uuid), public.grooming_kiosk_verify_pin(uuid,text), public.grooming_kiosk_action(uuid,text,text,text) TO authenticated;