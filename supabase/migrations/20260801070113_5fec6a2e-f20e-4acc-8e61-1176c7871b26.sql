CREATE TABLE public.vaccine_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  code text NOT NULL,
  name text NOT NULL,
  species text NOT NULL DEFAULT 'dog',
  default_validity_months integer NOT NULL DEFAULT 12,
  help_text text,
  active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, code, species)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.vaccine_types TO authenticated;
GRANT ALL ON public.vaccine_types TO service_role;

ALTER TABLE public.vaccine_types ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant read vaccine types" ON public.vaccine_types
  FOR SELECT TO authenticated
  USING (public.user_has_tenant_access(tenant_id) OR public.current_customer_id(tenant_id) IS NOT NULL);

CREATE POLICY "manage vaccine types insert" ON public.vaccine_types
  FOR INSERT TO authenticated
  WITH CHECK (public.user_has_permission(tenant_id, 'settings.vaccination.manage'));

CREATE POLICY "manage vaccine types update" ON public.vaccine_types
  FOR UPDATE TO authenticated
  USING (public.user_has_permission(tenant_id, 'settings.vaccination.manage'))
  WITH CHECK (public.user_has_permission(tenant_id, 'settings.vaccination.manage'));

CREATE POLICY "manage vaccine types delete" ON public.vaccine_types
  FOR DELETE TO authenticated
  USING (public.user_has_permission(tenant_id, 'settings.vaccination.manage'));

CREATE TRIGGER vaccine_types_set_updated_at
  BEFORE UPDATE ON public.vaccine_types
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Customers need to read the per-service requirements to see their checklist.
DROP POLICY IF EXISTS "tenant read vax rules" ON public.vaccination_rules;
CREATE POLICY "tenant read vax rules" ON public.vaccination_rules
  FOR SELECT TO authenticated
  USING (public.user_has_tenant_access(tenant_id) OR public.current_customer_id(tenant_id) IS NOT NULL);

-- Seed catalog from existing free-text values.
INSERT INTO public.vaccine_types (tenant_id, code, name, species)
SELECT DISTINCT r.tenant_id, lower(trim(r.vaccine_type)), initcap(replace(trim(r.vaccine_type), '_', ' ')), coalesce(r.species, 'dog')
FROM public.vaccination_rules r
WHERE coalesce(trim(r.vaccine_type), '') <> ''
ON CONFLICT (tenant_id, code, species) DO NOTHING;

INSERT INTO public.vaccine_types (tenant_id, code, name, species)
SELECT DISTINCT v.tenant_id, lower(trim(v.vaccination_type)), initcap(replace(trim(v.vaccination_type), '_', ' ')), coalesce(p.species::text, 'dog')
FROM public.vaccinations v
JOIN public.pets p ON p.id = v.pet_id
WHERE coalesce(trim(v.vaccination_type), '') <> ''
ON CONFLICT (tenant_id, code, species) DO NOTHING;