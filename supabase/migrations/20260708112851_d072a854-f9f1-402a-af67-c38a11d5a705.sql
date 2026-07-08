
-- 1. Permission
INSERT INTO public.permissions (code, label, description)
VALUES ('settings.invoicing.manage', 'Manage invoicing settings', 'Edit invoice prefix, company details, payment methods, VAT and reminder cadence.')
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.role_permissions (role_id, permission_id)
SELECT DISTINCT rp.role_id, (SELECT id FROM public.permissions WHERE code = 'settings.invoicing.manage')
FROM public.role_permissions rp
JOIN public.permissions p ON p.id = rp.permission_id
WHERE p.code IN ('settings.daycare.manage','settings.vans.manage','settings.transport.manage')
ON CONFLICT DO NOTHING;

-- 2. invoicing_settings
CREATE TABLE public.invoicing_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL UNIQUE REFERENCES public.tenants(id) ON DELETE CASCADE,
  company_name text,
  vat_number text,
  address text,
  banking_details text,
  invoice_prefix text NOT NULL DEFAULT 'INV',
  next_number integer NOT NULL DEFAULT 1,
  payment_terms_days integer NOT NULL DEFAULT 14,
  default_vat_rate numeric(5,2) NOT NULL DEFAULT 15.00,
  footer_notes text,
  reminder_days integer[] NOT NULL DEFAULT ARRAY[3,7,14],
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.invoicing_settings TO authenticated;
GRANT ALL ON public.invoicing_settings TO service_role;

ALTER TABLE public.invoicing_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY invoicing_settings_staff_select ON public.invoicing_settings
  FOR SELECT USING (public.user_has_tenant_access(tenant_id));
CREATE POLICY invoicing_settings_staff_insert ON public.invoicing_settings
  FOR INSERT WITH CHECK (public.user_has_permission(tenant_id, 'settings.invoicing.manage'));
CREATE POLICY invoicing_settings_staff_update ON public.invoicing_settings
  FOR UPDATE USING (public.user_has_permission(tenant_id, 'settings.invoicing.manage'))
  WITH CHECK (public.user_has_permission(tenant_id, 'settings.invoicing.manage'));
CREATE POLICY invoicing_settings_staff_delete ON public.invoicing_settings
  FOR DELETE USING (public.user_has_permission(tenant_id, 'settings.invoicing.manage'));

CREATE TRIGGER invoicing_settings_set_updated_at
  BEFORE UPDATE ON public.invoicing_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 3. payment_methods
CREATE TABLE public.payment_methods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  code text NOT NULL,
  label text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, code)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.payment_methods TO authenticated;
GRANT ALL ON public.payment_methods TO service_role;

ALTER TABLE public.payment_methods ENABLE ROW LEVEL SECURITY;

CREATE POLICY payment_methods_staff_select ON public.payment_methods
  FOR SELECT USING (public.user_has_tenant_access(tenant_id));
CREATE POLICY payment_methods_staff_insert ON public.payment_methods
  FOR INSERT WITH CHECK (public.user_has_permission(tenant_id, 'settings.invoicing.manage'));
CREATE POLICY payment_methods_staff_update ON public.payment_methods
  FOR UPDATE USING (public.user_has_permission(tenant_id, 'settings.invoicing.manage'))
  WITH CHECK (public.user_has_permission(tenant_id, 'settings.invoicing.manage'));
CREATE POLICY payment_methods_staff_delete ON public.payment_methods
  FOR DELETE USING (public.user_has_permission(tenant_id, 'settings.invoicing.manage'));

CREATE TRIGGER payment_methods_set_updated_at
  BEFORE UPDATE ON public.payment_methods
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 4. Seed defaults per existing tenant
INSERT INTO public.invoicing_settings (tenant_id)
SELECT id FROM public.tenants
ON CONFLICT (tenant_id) DO NOTHING;

INSERT INTO public.payment_methods (tenant_id, code, label, sort_order)
SELECT t.id, m.code, m.label, m.sort_order
FROM public.tenants t
CROSS JOIN (VALUES
  ('cash','Cash',1),
  ('eft','EFT / Bank transfer',2),
  ('card','Card (manual)',3),
  ('other','Other',4)
) AS m(code, label, sort_order)
ON CONFLICT (tenant_id, code) DO NOTHING;

-- 5. Invoice number generator
CREATE OR REPLACE FUNCTION public.next_invoice_number(target_tenant_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_prefix text;
  v_next integer;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext(target_tenant_id::text || ':invoice_number'));

  INSERT INTO public.invoicing_settings (tenant_id)
  VALUES (target_tenant_id)
  ON CONFLICT (tenant_id) DO NOTHING;

  UPDATE public.invoicing_settings
    SET next_number = next_number + 1
    WHERE tenant_id = target_tenant_id
    RETURNING invoice_prefix, next_number - 1
    INTO v_prefix, v_next;

  RETURN v_prefix || lpad(v_next::text, 5, '0');
END;
$$;
