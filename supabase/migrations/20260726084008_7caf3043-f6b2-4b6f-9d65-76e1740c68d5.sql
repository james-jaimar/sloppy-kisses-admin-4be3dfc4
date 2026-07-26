-- =========================================================================
-- Phase A: schema for daycare registration form + T&Cs
-- =========================================================================

-- --- Customers: emergency + vet + owner detail --------------------------
ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS id_number text,
  ADD COLUMN IF NOT EXISTS occupation text,
  ADD COLUMN IF NOT EXISTS employer text,
  ADD COLUMN IF NOT EXISTS work_address text,
  ADD COLUMN IF NOT EXISTS emergency_contact_name text,
  ADD COLUMN IF NOT EXISTS emergency_contact_relationship text,
  ADD COLUMN IF NOT EXISTS emergency_contact_mobile text,
  ADD COLUMN IF NOT EXISTS vet_clinic_name text,
  ADD COLUMN IF NOT EXISTS vet_clinic_contact text,
  ADD COLUMN IF NOT EXISTS vet_clinic_address text;

-- --- Pets: behaviour + medical aid + power breed ------------------------
ALTER TABLE public.pets
  ADD COLUMN IF NOT EXISTS is_spayed_neutered boolean,
  ADD COLUMN IF NOT EXISTS medical_aid_provider text,
  ADD COLUMN IF NOT EXISTS medical_aid_number text,
  ADD COLUMN IF NOT EXISTS behaviour_jumps boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS behaviour_nervous boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS behaviour_barker boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS behaviour_social boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS behaviour_aggressive_history boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_power_breed boolean NOT NULL DEFAULT false;

-- --- Vaccinations: product + next due + card link -----------------------
ALTER TABLE public.vaccinations
  ADD COLUMN IF NOT EXISTS product_name text,
  ADD COLUMN IF NOT EXISTS next_due_date date,
  ADD COLUMN IF NOT EXISTS card_document_id uuid REFERENCES public.documents(id) ON DELETE SET NULL;

-- --- Parasite treatments log --------------------------------------------
CREATE TABLE IF NOT EXISTS public.pet_parasite_treatments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  pet_id uuid NOT NULL REFERENCES public.pets(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('tick_flea','deworming')),
  product_name text,
  administered_on date NOT NULL,
  next_due_date date,
  notes text,
  recorded_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pet_parasite_treatments TO authenticated;
GRANT ALL ON public.pet_parasite_treatments TO service_role;
ALTER TABLE public.pet_parasite_treatments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pet_parasite_treatments_tenant_read" ON public.pet_parasite_treatments
  FOR SELECT TO authenticated
  USING (public.user_has_tenant_access(tenant_id));

CREATE POLICY "pet_parasite_treatments_tenant_write" ON public.pet_parasite_treatments
  FOR ALL TO authenticated
  USING (public.user_has_tenant_access(tenant_id) AND public.user_has_permission(tenant_id, 'pets.manage'))
  WITH CHECK (public.user_has_tenant_access(tenant_id) AND public.user_has_permission(tenant_id, 'pets.manage'));

CREATE INDEX IF NOT EXISTS pet_parasite_treatments_pet_idx ON public.pet_parasite_treatments (pet_id, administered_on DESC);

-- --- Terms versions -----------------------------------------------------
CREATE TABLE IF NOT EXISTS public.tenant_terms_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('terms','registration','popia','media_consent','vet_emergency','power_breed')),
  version text NOT NULL,
  title text,
  body_markdown text,
  pdf_document_id uuid REFERENCES public.documents(id) ON DELETE SET NULL,
  effective_from date NOT NULL DEFAULT CURRENT_DATE,
  is_current boolean NOT NULL DEFAULT false,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, kind, version)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tenant_terms_versions TO authenticated;
GRANT SELECT ON public.tenant_terms_versions TO anon;
GRANT ALL ON public.tenant_terms_versions TO service_role;
ALTER TABLE public.tenant_terms_versions ENABLE ROW LEVEL SECURITY;

-- Anyone signed in in the tenant can read (portal customers need to see current version)
CREATE POLICY "tenant_terms_versions_tenant_read" ON public.tenant_terms_versions
  FOR SELECT TO authenticated
  USING (public.user_has_tenant_access(tenant_id));

-- Public read of *current* versions only, for the portal signup page
CREATE POLICY "tenant_terms_versions_public_current_read" ON public.tenant_terms_versions
  FOR SELECT TO anon
  USING (is_current = true);

CREATE POLICY "tenant_terms_versions_manage" ON public.tenant_terms_versions
  FOR ALL TO authenticated
  USING (public.user_has_permission(tenant_id, 'settings.terms.manage'))
  WITH CHECK (public.user_has_permission(tenant_id, 'settings.terms.manage'));

-- Only one current version per (tenant, kind)
CREATE UNIQUE INDEX IF NOT EXISTS tenant_terms_versions_current_uniq
  ON public.tenant_terms_versions (tenant_id, kind)
  WHERE is_current;

-- --- Customer consents --------------------------------------------------
CREATE TABLE IF NOT EXISTS public.customer_consents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  version_id uuid NOT NULL REFERENCES public.tenant_terms_versions(id) ON DELETE RESTRICT,
  kind text NOT NULL,
  version_label text NOT NULL,
  signature_name text NOT NULL,
  ip_address inet,
  user_agent text,
  accepted_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.customer_consents TO authenticated;
GRANT ALL ON public.customer_consents TO service_role;
ALTER TABLE public.customer_consents ENABLE ROW LEVEL SECURITY;

-- Staff read within tenant
CREATE POLICY "customer_consents_staff_read" ON public.customer_consents
  FOR SELECT TO authenticated
  USING (public.user_has_permission(tenant_id, 'customers.view'));

-- Customer read own
CREATE POLICY "customer_consents_own_read" ON public.customer_consents
  FOR SELECT TO authenticated
  USING (customer_id = public.current_customer_id(tenant_id));

-- Customer insert own
CREATE POLICY "customer_consents_own_insert" ON public.customer_consents
  FOR INSERT TO authenticated
  WITH CHECK (customer_id = public.current_customer_id(tenant_id));

-- Staff insert on behalf
CREATE POLICY "customer_consents_staff_insert" ON public.customer_consents
  FOR INSERT TO authenticated
  WITH CHECK (public.user_has_permission(tenant_id, 'customers.manage'));

CREATE INDEX IF NOT EXISTS customer_consents_customer_idx ON public.customer_consents (customer_id, kind, accepted_at DESC);

-- --- Policy settings (one row per tenant) -------------------------------
CREATE TABLE IF NOT EXISTS public.policy_settings (
  tenant_id uuid PRIMARY KEY REFERENCES public.tenants(id) ON DELETE CASCADE,

  -- Hotel
  hotel_deposit_percent numeric(5,2) NOT NULL DEFAULT 50.00,
  hotel_balance_due_days_before integer NOT NULL DEFAULT 30,
  hotel_cancellation_cutoff_days integer NOT NULL DEFAULT 30,
  hotel_free_amendments integer NOT NULL DEFAULT 1,
  hotel_amendment_fee numeric(10,2) NOT NULL DEFAULT 150.00,

  -- Daycare
  daycare_notice_months integer NOT NULL DEFAULT 1,
  daycare_catchup_window_days integer NOT NULL DEFAULT 30,

  -- Grooming
  grooming_cancellation_hours integer NOT NULL DEFAULT 24,

  -- Invoicing
  overdue_interest_percent_per_month numeric(5,2) NOT NULL DEFAULT 3.00,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.policy_settings TO authenticated;
GRANT ALL ON public.policy_settings TO service_role;
ALTER TABLE public.policy_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "policy_settings_tenant_read" ON public.policy_settings
  FOR SELECT TO authenticated
  USING (public.user_has_tenant_access(tenant_id));

CREATE POLICY "policy_settings_manage" ON public.policy_settings
  FOR ALL TO authenticated
  USING (public.user_has_permission(tenant_id, 'settings.policies.manage'))
  WITH CHECK (public.user_has_permission(tenant_id, 'settings.policies.manage'));

-- Seed one row per existing tenant
INSERT INTO public.policy_settings (tenant_id)
SELECT id FROM public.tenants
ON CONFLICT (tenant_id) DO NOTHING;

-- --- Permissions --------------------------------------------------------
-- Permissions (columns discovered at runtime — table has 5 cols; safest minimal insert)
INSERT INTO public.permissions (code, label)
SELECT v.code, v.label
FROM (VALUES
  ('settings.terms.manage', 'Manage terms & conditions'),
  ('settings.policies.manage', 'Manage policy settings')
) AS v(code, label)
WHERE NOT EXISTS (SELECT 1 FROM public.permissions p WHERE p.code = v.code);

-- --- updated_at triggers ------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS pet_parasite_treatments_touch ON public.pet_parasite_treatments;
CREATE TRIGGER pet_parasite_treatments_touch BEFORE UPDATE ON public.pet_parasite_treatments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS tenant_terms_versions_touch ON public.tenant_terms_versions;
CREATE TRIGGER tenant_terms_versions_touch BEFORE UPDATE ON public.tenant_terms_versions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS policy_settings_touch ON public.policy_settings;
CREATE TRIGGER policy_settings_touch BEFORE UPDATE ON public.policy_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();