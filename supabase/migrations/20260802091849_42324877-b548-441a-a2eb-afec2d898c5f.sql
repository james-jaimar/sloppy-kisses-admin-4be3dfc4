ALTER TABLE public.grooming_workflow_settings
  ADD COLUMN IF NOT EXISTS min_lead_hours integer NOT NULL DEFAULT 24,
  ADD COLUMN IF NOT EXISTS require_prepayment_short_notice boolean NOT NULL DEFAULT true;

ALTER TABLE public.hotel_workflow_settings
  ADD COLUMN IF NOT EXISTS min_lead_hours integer NOT NULL DEFAULT 24,
  ADD COLUMN IF NOT EXISTS require_prepayment_short_notice boolean NOT NULL DEFAULT true;

ALTER TABLE public.transport_workflow_settings
  ADD COLUMN IF NOT EXISTS min_lead_hours integer NOT NULL DEFAULT 24,
  ADD COLUMN IF NOT EXISTS require_prepayment_short_notice boolean NOT NULL DEFAULT true;

CREATE TABLE IF NOT EXISTS public.billing_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  period_start date NOT NULL,
  period_end date NOT NULL,
  service text NOT NULL DEFAULT 'daycare',
  invoices_created integer NOT NULL DEFAULT 0,
  invoices_updated integer NOT NULL DEFAULT 0,
  total_amount numeric(12,2) NOT NULL DEFAULT 0,
  issued_count integer NOT NULL DEFAULT 0,
  notes text,
  run_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.billing_runs TO authenticated;
GRANT ALL ON public.billing_runs TO service_role;

ALTER TABLE public.billing_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "billing_runs_select" ON public.billing_runs
  FOR SELECT TO authenticated
  USING (public.user_has_tenant_access(tenant_id));

CREATE POLICY "billing_runs_insert" ON public.billing_runs
  FOR INSERT TO authenticated
  WITH CHECK (public.user_has_permission(tenant_id, 'invoices.manage'));

CREATE POLICY "billing_runs_update" ON public.billing_runs
  FOR UPDATE TO authenticated
  USING (public.user_has_permission(tenant_id, 'invoices.manage'))
  WITH CHECK (public.user_has_permission(tenant_id, 'invoices.manage'));

CREATE TRIGGER billing_runs_set_updated_at
  BEFORE UPDATE ON public.billing_runs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX IF NOT EXISTS billing_runs_tenant_period_idx
  ON public.billing_runs (tenant_id, period_start DESC);