-- 1. Enable trigram similarity for fuzzy owner matching
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- 2. Update rate card
UPDATE public.daycare_plans SET price = 1100, billing_period = 'month' WHERE days_per_week = 1;
UPDATE public.daycare_plans SET price = 2100, billing_period = 'month' WHERE days_per_week = 2;
UPDATE public.daycare_plans SET price = 3150, billing_period = 'month' WHERE days_per_week = 3;
UPDATE public.daycare_plans SET price = 4100, billing_period = 'month' WHERE days_per_week = 4;
UPDATE public.daycare_plans SET price = 5000, billing_period = 'month' WHERE days_per_week = 5;
UPDATE public.daycare_plans SET price = 300, billing_period = 'one_off' WHERE name ILIKE '%half%';
UPDATE public.daycare_plans SET price = 350, billing_period = 'one_off' WHERE name ILIKE '%full day%' OR name ILIKE 'Casual full day';

-- 3. Staging table for register imports
CREATE TABLE public.daycare_import_rows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  batch_id uuid NOT NULL,
  dog_full_name text NOT NULL,
  pet_first text NOT NULL,
  owner_surname text NOT NULL,
  breed text,
  size text,
  sex text,
  days_per_week int,
  selected_days text[] NOT NULL DEFAULT '{}',
  matched_pet_id uuid REFERENCES public.pets(id) ON DELETE SET NULL,
  matched_customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  candidates jsonb NOT NULL DEFAULT '[]',
  match_confidence numeric,
  match_status text NOT NULL DEFAULT 'needs_review',
  -- 'auto' | 'needs_review' | 'unmatched' | 'confirmed' | 'skip' | 'committed'
  commit_result jsonb,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX daycare_import_rows_batch_idx ON public.daycare_import_rows(tenant_id, batch_id);
CREATE INDEX daycare_import_rows_status_idx ON public.daycare_import_rows(tenant_id, match_status);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.daycare_import_rows TO authenticated;
GRANT ALL ON public.daycare_import_rows TO service_role;

ALTER TABLE public.daycare_import_rows ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff with daycare manage can view import rows"
  ON public.daycare_import_rows FOR SELECT TO authenticated
  USING (public.user_has_permission(tenant_id, 'settings.daycare.manage'));

CREATE POLICY "Staff with daycare manage can insert import rows"
  ON public.daycare_import_rows FOR INSERT TO authenticated
  WITH CHECK (public.user_has_permission(tenant_id, 'settings.daycare.manage'));

CREATE POLICY "Staff with daycare manage can update import rows"
  ON public.daycare_import_rows FOR UPDATE TO authenticated
  USING (public.user_has_permission(tenant_id, 'settings.daycare.manage'))
  WITH CHECK (public.user_has_permission(tenant_id, 'settings.daycare.manage'));

CREATE POLICY "Staff with daycare manage can delete import rows"
  ON public.daycare_import_rows FOR DELETE TO authenticated
  USING (public.user_has_permission(tenant_id, 'settings.daycare.manage'));

CREATE TRIGGER daycare_import_rows_updated_at
  BEFORE UPDATE ON public.daycare_import_rows
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
