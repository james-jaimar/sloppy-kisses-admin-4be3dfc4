-- Sprint 3: In-house grooming to parity

CREATE TABLE IF NOT EXISTS public.grooming_workflow_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  vax_gate_mode text NOT NULL DEFAULT 'soft' CHECK (vax_gate_mode IN ('off','soft','hard')),
  pensioner_discount_pct numeric(5,2) NOT NULL DEFAULT 10.00,
  default_mobile_travel_fee_zar numeric(10,2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.grooming_workflow_settings TO authenticated;
GRANT ALL ON public.grooming_workflow_settings TO service_role;

ALTER TABLE public.grooming_workflow_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "grooming_workflow_select" ON public.grooming_workflow_settings
  FOR SELECT TO authenticated USING (public.user_has_tenant_access(tenant_id));
CREATE POLICY "grooming_workflow_insert" ON public.grooming_workflow_settings
  FOR INSERT TO authenticated
  WITH CHECK (public.user_has_permission(tenant_id, 'settings.grooming.manage'));
CREATE POLICY "grooming_workflow_update" ON public.grooming_workflow_settings
  FOR UPDATE TO authenticated
  USING (public.user_has_permission(tenant_id, 'settings.grooming.manage'))
  WITH CHECK (public.user_has_permission(tenant_id, 'settings.grooming.manage'));
CREATE POLICY "grooming_workflow_delete" ON public.grooming_workflow_settings
  FOR DELETE TO authenticated
  USING (public.user_has_permission(tenant_id, 'settings.grooming.manage'));

DROP TRIGGER IF EXISTS trg_grooming_workflow_set_updated_at ON public.grooming_workflow_settings;
CREATE TRIGGER trg_grooming_workflow_set_updated_at
BEFORE UPDATE ON public.grooming_workflow_settings
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.grooming_can_confirm_booking(p_booking_id uuid)
RETURNS TABLE(pet_id uuid, pet_name text, vaccine_type text, status text, expiry_date date)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_booking public.bookings;
BEGIN
  SELECT * INTO v_booking FROM public.bookings WHERE id = p_booking_id;
  IF v_booking.id IS NULL THEN RETURN; END IF;

  RETURN QUERY
  WITH pets_on_booking AS (
    SELECT p.id AS pet_id, p.name AS pet_name, p.species::text AS species
    FROM public.booking_pets bp
    JOIN public.pets p ON p.id = bp.pet_id
    WHERE bp.booking_id = p_booking_id
  ),
  required_rules AS (
    SELECT r.vaccine_type, r.species::text AS species, COALESCE(r.grace_days, 0) AS grace_days
    FROM public.vaccination_rules r
    WHERE r.tenant_id = v_booking.tenant_id
      AND r.service_type::text = v_booking.service_type::text
      AND r.required = true
  ),
  latest_vax AS (
    SELECT DISTINCT ON (v.pet_id, v.vaccination_type)
      v.pet_id, v.vaccination_type, v.expiry_date, v.verified
    FROM public.vaccinations v
    ORDER BY v.pet_id, v.vaccination_type, v.administered_date DESC NULLS LAST
  )
  SELECT
    p.pet_id, p.pet_name, r.vaccine_type,
    CASE
      WHEN lv.pet_id IS NULL THEN 'missing'
      WHEN lv.expiry_date IS NULL THEN 'no_expiry'
      WHEN lv.expiry_date < (COALESCE(v_booking.start_date, now()::date) - (r.grace_days || ' days')::interval)::date THEN 'expired'
      WHEN lv.verified = false THEN 'unverified'
      ELSE 'ok'
    END AS status,
    lv.expiry_date
  FROM pets_on_booking p
  CROSS JOIN required_rules r
  LEFT JOIN latest_vax lv ON lv.pet_id = p.pet_id AND lv.vaccination_type::text = r.vaccine_type::text
  WHERE (r.species = p.species OR r.species = 'any')
  ORDER BY p.pet_name, r.vaccine_type;
END;
$$;
REVOKE ALL ON FUNCTION public.grooming_can_confirm_booking(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.grooming_can_confirm_booking(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.grooming_details_auto_invoice()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_booking public.bookings;
  v_pkg public.grooming_packages;
  v_pet_name text;
  v_inv uuid;
  v_sort integer;
  v_pkg_price numeric(12,2);
  v_disc_pct numeric(5,2);
BEGIN
  SELECT * INTO v_booking FROM public.bookings WHERE id = NEW.booking_id;
  IF v_booking.id IS NULL OR v_booking.invoice_id IS NOT NULL THEN RETURN NEW; END IF;
  IF NOT COALESCE(public._auto_invoice_enabled(NEW.tenant_id, 'grooming'), true) THEN RETURN NEW; END IF;

  IF NEW.package_id IS NOT NULL THEN
    SELECT * INTO v_pkg FROM public.grooming_packages WHERE id = NEW.package_id;
  END IF;
  v_pkg_price := COALESCE(v_pkg.price_zar, 0);

  SELECT COALESCE(pensioner_discount_pct, 0) INTO v_disc_pct
  FROM public.grooming_workflow_settings WHERE tenant_id = NEW.tenant_id LIMIT 1;
  v_disc_pct := COALESCE(v_disc_pct, 0);

  SELECT p.name INTO v_pet_name
  FROM public.booking_pets bp JOIN public.pets p ON p.id = bp.pet_id
  WHERE bp.booking_id = v_booking.id LIMIT 1;

  v_inv := public.ensure_draft_invoice(v_booking.tenant_id, v_booking.customer_id);
  UPDATE public.bookings SET invoice_id = v_inv WHERE id = v_booking.id;

  SELECT COALESCE(MAX(sort_order),0)+1 INTO v_sort FROM public.invoice_items WHERE invoice_id = v_inv;

  INSERT INTO public.invoice_items(
    tenant_id, invoice_id, booking_id, description, quantity, unit_price, sort_order, discount_pct
  ) VALUES (
    v_booking.tenant_id, v_inv, v_booking.id,
    'Grooming — ' || COALESCE(v_pkg.name, COALESCE(NEW.service_package, 'Service'))
      || CASE WHEN v_pet_name IS NOT NULL THEN ' (' || v_pet_name || ')' ELSE '' END,
    1, v_pkg_price, v_sort,
    CASE WHEN COALESCE(NEW.pensioner_discount, false) THEN v_disc_pct ELSE 0 END
  );
  v_sort := v_sort + 1;

  IF COALESCE(NEW.travel_fee,0) > 0 THEN
    INSERT INTO public.invoice_items(tenant_id, invoice_id, booking_id, description, quantity, unit_price, sort_order)
    VALUES (v_booking.tenant_id, v_inv, v_booking.id, 'Mobile travel fee', 1, NEW.travel_fee, v_sort);
    v_sort := v_sort + 1;
  END IF;
  IF COALESCE(NEW.matted_surcharge_zar,0) > 0 THEN
    INSERT INTO public.invoice_items(tenant_id, invoice_id, booking_id, description, quantity, unit_price, sort_order)
    VALUES (v_booking.tenant_id, v_inv, v_booking.id, 'Matted coat surcharge', 1, NEW.matted_surcharge_zar, v_sort);
    v_sort := v_sort + 1;
  END IF;
  IF COALESCE(NEW.sedation_surcharge_zar,0) > 0 THEN
    INSERT INTO public.invoice_items(tenant_id, invoice_id, booking_id, description, quantity, unit_price, sort_order)
    VALUES (v_booking.tenant_id, v_inv, v_booking.id, 'Sedation surcharge', 1, NEW.sedation_surcharge_zar, v_sort);
  END IF;

  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.grooming_details_auto_invoice() FROM PUBLIC, anon, authenticated;