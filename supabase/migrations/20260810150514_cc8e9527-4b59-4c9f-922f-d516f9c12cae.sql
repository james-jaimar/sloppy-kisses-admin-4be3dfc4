-- 1. Power breeds ---------------------------------------------------------
ALTER TABLE public.dog_breeds ADD COLUMN IF NOT EXISTS is_power_breed boolean NOT NULL DEFAULT false;

UPDATE public.dog_breeds SET is_power_breed = true
WHERE lower(name) ~ '(pit ?bull|staffordshire|bull terrier|rottweiler|boerboel|cane corso|dogo argentino|presa canario|tosa|akita|american bully|bullmastiff|dogue de bordeaux|caucasian|central asian shepherd|fila|alabai)';

CREATE OR REPLACE FUNCTION public.pets_sync_power_breed()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_flag boolean;
BEGIN
  IF NEW.breed IS NULL OR btrim(NEW.breed) = '' THEN RETURN NEW; END IF;
  SELECT is_power_breed INTO v_flag FROM public.dog_breeds
   WHERE lower(name) = lower(btrim(NEW.breed)) LIMIT 1;
  IF v_flag IS TRUE THEN NEW.is_power_breed := true; END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_pets_sync_power_breed ON public.pets;
CREATE TRIGGER trg_pets_sync_power_breed
BEFORE INSERT OR UPDATE OF breed ON public.pets
FOR EACH ROW EXECUTE FUNCTION public.pets_sync_power_breed();

UPDATE public.pets p SET is_power_breed = true
FROM public.dog_breeds b
WHERE b.is_power_breed AND lower(b.name) = lower(btrim(p.breed)) AND p.is_power_breed = false;

-- 2. Parasite treatment rules (settings-first) ------------------------------
CREATE TABLE IF NOT EXISTS public.parasite_treatment_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  kind text NOT NULL,
  label text NOT NULL,
  interval_days integer NOT NULL DEFAULT 90,
  grace_days integer NOT NULL DEFAULT 7,
  gate_mode text NOT NULL DEFAULT 'warn',
  species text NOT NULL DEFAULT 'all',
  chargeable_on_arrival boolean NOT NULL DEFAULT false,
  active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, kind)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.parasite_treatment_rules TO authenticated;
GRANT ALL ON public.parasite_treatment_rules TO service_role;
ALTER TABLE public.parasite_treatment_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "parasite_rules_read" ON public.parasite_treatment_rules
FOR SELECT TO authenticated USING (public.user_has_tenant_access(tenant_id));
CREATE POLICY "parasite_rules_write" ON public.parasite_treatment_rules
FOR ALL TO authenticated
USING (public.user_has_permission(tenant_id, 'settings.manage'))
WITH CHECK (public.user_has_permission(tenant_id, 'settings.manage'));

DROP TRIGGER IF EXISTS trg_parasite_rules_updated ON public.parasite_treatment_rules;
CREATE TRIGGER trg_parasite_rules_updated BEFORE UPDATE ON public.parasite_treatment_rules
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.parasite_treatment_rules (tenant_id, kind, label, interval_days, grace_days, gate_mode, chargeable_on_arrival, sort_order)
SELECT t.id, v.kind, v.label, v.interval_days, v.grace_days, v.gate_mode, v.chargeable, v.sort_order
FROM public.tenants t
CROSS JOIN (VALUES
  ('tick_flea', 'Tick & flea', 30, 7, 'warn', true, 1),
  ('deworming', 'Deworming', 90, 14, 'warn', false, 2),
  ('kennel_cough', 'Kennel cough', 365, 14, 'warn', false, 3)
) AS v(kind, label, interval_days, grace_days, gate_mode, chargeable, sort_order)
ON CONFLICT (tenant_id, kind) DO NOTHING;

-- keep next_due_date in step with the rule interval
CREATE OR REPLACE FUNCTION public.parasite_treatments_set_due()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_days integer;
BEGIN
  IF NEW.next_due_date IS NULL THEN
    SELECT interval_days INTO v_days FROM public.parasite_treatment_rules
     WHERE tenant_id = NEW.tenant_id AND kind = NEW.kind AND active LIMIT 1;
    IF v_days IS NOT NULL THEN
      NEW.next_due_date := NEW.administered_on + (v_days || ' days')::interval;
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_parasite_treatments_set_due ON public.pet_parasite_treatments;
CREATE TRIGGER trg_parasite_treatments_set_due
BEFORE INSERT OR UPDATE ON public.pet_parasite_treatments
FOR EACH ROW EXECUTE FUNCTION public.parasite_treatments_set_due();

-- 3. Health holds -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.pet_health_holds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  pet_id uuid NOT NULL REFERENCES public.pets(id) ON DELETE CASCADE,
  reason text NOT NULL,
  notes text,
  started_on date NOT NULL DEFAULT current_date,
  expected_clear_on date,
  blocks_attendance boolean NOT NULL DEFAULT true,
  cleared_at timestamptz,
  cleared_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  clearance_document_id uuid REFERENCES public.documents(id) ON DELETE SET NULL,
  clearance_notes text,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS pet_health_holds_pet_idx ON public.pet_health_holds (pet_id) WHERE cleared_at IS NULL;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pet_health_holds TO authenticated;
GRANT ALL ON public.pet_health_holds TO service_role;
ALTER TABLE public.pet_health_holds ENABLE ROW LEVEL SECURITY;

CREATE POLICY "health_holds_staff_read" ON public.pet_health_holds
FOR SELECT TO authenticated USING (public.user_has_tenant_access(tenant_id));
CREATE POLICY "health_holds_staff_write" ON public.pet_health_holds
FOR ALL TO authenticated
USING (public.user_has_permission(tenant_id, 'pets.manage'))
WITH CHECK (public.user_has_permission(tenant_id, 'pets.manage'));
CREATE POLICY "health_holds_customer_read" ON public.pet_health_holds
FOR SELECT TO authenticated USING (
  public.user_can_access_pet(tenant_id, pet_id)
);

DROP TRIGGER IF EXISTS trg_health_holds_updated ON public.pet_health_holds;
CREATE TRIGGER trg_health_holds_updated BEFORE UPDATE ON public.pet_health_holds
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 4. Health gate status ------------------------------------------------------
CREATE OR REPLACE FUNCTION public.pet_health_gate(p_pet_id uuid, p_on date DEFAULT current_date)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_tenant uuid;
  v_treatments jsonb := '[]'::jsonb;
  v_holds jsonb := '[]'::jsonb;
  v_blocked boolean := false;
BEGIN
  SELECT tenant_id INTO v_tenant FROM public.pets WHERE id = p_pet_id;
  IF v_tenant IS NULL THEN RETURN jsonb_build_object('ok', true, 'treatments', v_treatments, 'holds', v_holds); END IF;
  IF NOT public.user_has_tenant_access(v_tenant) AND NOT public.user_can_access_pet(v_tenant, p_pet_id) THEN
    RAISE EXCEPTION 'Not permitted';
  END IF;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'kind', r.kind, 'label', r.label, 'gate_mode', r.gate_mode,
           'chargeable_on_arrival', r.chargeable_on_arrival,
           'last_administered', t.administered_on, 'next_due_date', t.next_due_date,
           'status', CASE
             WHEN t.id IS NULL THEN 'missing'
             WHEN t.next_due_date IS NULL THEN 'ok'
             WHEN t.next_due_date + (r.grace_days || ' days')::interval < p_on THEN 'overdue'
             WHEN t.next_due_date < p_on THEN 'due'
             ELSE 'ok' END
         ) ORDER BY r.sort_order), '[]'::jsonb)
    INTO v_treatments
  FROM public.parasite_treatment_rules r
  LEFT JOIN LATERAL (
    SELECT * FROM public.pet_parasite_treatments pt
     WHERE pt.pet_id = p_pet_id AND pt.kind = r.kind
     ORDER BY pt.administered_on DESC LIMIT 1
  ) t ON true
  WHERE r.tenant_id = v_tenant AND r.active;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'id', h.id, 'reason', h.reason, 'notes', h.notes,
           'started_on', h.started_on, 'blocks_attendance', h.blocks_attendance)), '[]'::jsonb)
    INTO v_holds
  FROM public.pet_health_holds h
  WHERE h.pet_id = p_pet_id AND h.cleared_at IS NULL;

  v_blocked := EXISTS (SELECT 1 FROM public.pet_health_holds h WHERE h.pet_id = p_pet_id AND h.cleared_at IS NULL AND h.blocks_attendance)
    OR EXISTS (
      SELECT 1 FROM jsonb_array_elements(v_treatments) e
      WHERE e->>'gate_mode' = 'block' AND e->>'status' IN ('missing', 'overdue')
    );

  RETURN jsonb_build_object('ok', NOT v_blocked, 'blocked', v_blocked, 'treatments', v_treatments, 'holds', v_holds);
END $$;

REVOKE EXECUTE ON FUNCTION public.pet_health_gate(uuid, date) FROM anon;
GRANT EXECUTE ON FUNCTION public.pet_health_gate(uuid, date) TO authenticated;

-- 5. Chargeable on-arrival treatment ----------------------------------------
CREATE OR REPLACE FUNCTION public.charge_arrival_parasite_treatment(
  p_booking_id uuid, p_pet_id uuid, p_kind text DEFAULT 'tick_flea',
  p_product text DEFAULT NULL, p_note text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_b record; v_fee numeric; v_label text; v_invoice uuid;
BEGIN
  SELECT * INTO v_b FROM public.bookings WHERE id = p_booking_id;
  IF v_b.id IS NULL THEN RAISE EXCEPTION 'Booking not found'; END IF;
  IF NOT public.user_has_tenant_access(v_b.tenant_id) THEN RAISE EXCEPTION 'Not permitted'; END IF;

  SELECT coalesce(parasite_treatment_fee_zar, 0) INTO v_fee
    FROM public.policy_settings WHERE tenant_id = v_b.tenant_id;
  SELECT label INTO v_label FROM public.parasite_treatment_rules
   WHERE tenant_id = v_b.tenant_id AND kind = p_kind;

  INSERT INTO public.pet_parasite_treatments (tenant_id, pet_id, kind, administered_on, product_name, notes, recorded_by)
  VALUES (v_b.tenant_id, p_pet_id, p_kind, current_date, p_product,
          coalesce(p_note, 'Applied on arrival — no proof of treatment'), NULL);

  IF coalesce(v_fee, 0) > 0 THEN
    v_invoice := public.ensure_draft_invoice(p_booking_id);
    IF v_invoice IS NOT NULL THEN
      INSERT INTO public.invoice_items (tenant_id, invoice_id, booking_id, description, quantity, unit_price, sort_order)
      VALUES (v_b.tenant_id, v_invoice, p_booking_id,
              coalesce(v_label, 'Parasite treatment') || ' applied on arrival', 1, v_fee,
              coalesce((SELECT max(sort_order) + 1 FROM public.invoice_items WHERE invoice_id = v_invoice), 100));
    END IF;
  END IF;

  RETURN jsonb_build_object('charged', coalesce(v_fee, 0), 'invoice_id', v_invoice);
END $$;

REVOKE EXECUTE ON FUNCTION public.charge_arrival_parasite_treatment(uuid, uuid, text, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.charge_arrival_parasite_treatment(uuid, uuid, text, text, text) TO authenticated;

-- 6. Assessment gate ---------------------------------------------------------
ALTER TABLE public.daycare_workflow_settings
  ADD COLUMN IF NOT EXISTS require_assessment boolean NOT NULL DEFAULT false;
ALTER TABLE public.daycare_enrolments
  ADD COLUMN IF NOT EXISTS assessment_waived boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS assessment_booking_id uuid REFERENCES public.bookings(id) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION public.daycare_enrolments_assessment_gate()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_required boolean; v_done boolean;
BEGIN
  IF NOT NEW.active OR NEW.assessment_waived THEN RETURN NEW; END IF;
  SELECT require_assessment INTO v_required FROM public.daycare_workflow_settings WHERE tenant_id = NEW.tenant_id;
  IF v_required IS NOT TRUE THEN RETURN NEW; END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.bookings b
    JOIN public.booking_pets bp ON bp.booking_id = b.id
    WHERE b.tenant_id = NEW.tenant_id AND bp.pet_id = NEW.pet_id
      AND b.service_type = 'daycare_assessment'
      AND b.status IN ('completed', 'checked_out')
  ) INTO v_done;

  IF NOT v_done THEN
    RAISE EXCEPTION 'This pet has not completed a daycare assessment yet. Book an assessment or waive it on the enrolment.';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_daycare_enrolments_assessment_gate ON public.daycare_enrolments;
CREATE TRIGGER trg_daycare_enrolments_assessment_gate
BEFORE INSERT OR UPDATE OF active, assessment_waived ON public.daycare_enrolments
FOR EACH ROW EXECUTE FUNCTION public.daycare_enrolments_assessment_gate();