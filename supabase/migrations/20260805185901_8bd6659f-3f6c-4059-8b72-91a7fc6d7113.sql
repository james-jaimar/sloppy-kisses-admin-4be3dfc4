
-- Gateway activity: every inbound ITN, accepted or not.
CREATE TABLE public.payment_webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  provider text NOT NULL DEFAULT 'payfast',
  provider_mode text,
  invoice_id uuid REFERENCES public.invoices(id) ON DELETE SET NULL,
  payment_id uuid REFERENCES public.payments(id) ON DELETE SET NULL,
  pf_payment_id text,
  m_payment_id text,
  payment_status text,
  amount_gross numeric(12,2),
  outcome text NOT NULL DEFAULT 'received',
  error_text text,
  raw_body text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  source_ip text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.payment_webhook_events TO authenticated;
GRANT ALL ON public.payment_webhook_events TO service_role;

ALTER TABLE public.payment_webhook_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pwe_staff_select" ON public.payment_webhook_events
  FOR SELECT TO authenticated
  USING (
    is_platform_owner()
    OR (tenant_id IS NOT NULL AND user_has_tenant_access(tenant_id)
        AND (user_has_permission(tenant_id, 'payments.view')
             OR user_has_permission(tenant_id, 'settings.payment_providers.manage')))
  );

CREATE INDEX payment_webhook_events_tenant_created_idx
  ON public.payment_webhook_events (tenant_id, created_at DESC);
CREATE INDEX payment_webhook_events_invoice_idx
  ON public.payment_webhook_events (invoice_id);

CREATE TRIGGER payment_webhook_events_set_updated_at
  BEFORE UPDATE ON public.payment_webhook_events
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Checkout attempts: customer was redirected to the gateway.
CREATE TABLE public.payment_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  invoice_id uuid NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  provider text NOT NULL DEFAULT 'payfast',
  provider_mode text NOT NULL DEFAULT 'test',
  amount numeric(12,2) NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'redirected',
  payment_id uuid REFERENCES public.payments(id) ON DELETE SET NULL,
  origin text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.payment_attempts TO authenticated;
GRANT ALL ON public.payment_attempts TO service_role;

ALTER TABLE public.payment_attempts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pa_staff_select" ON public.payment_attempts
  FOR SELECT TO authenticated
  USING (
    is_platform_owner()
    OR (user_has_tenant_access(tenant_id)
        AND (user_has_permission(tenant_id, 'payments.view')
             OR user_has_permission(tenant_id, 'settings.payment_providers.manage')))
  );

CREATE POLICY "pa_customer_select_own" ON public.payment_attempts
  FOR SELECT TO authenticated
  USING (customer_id = current_customer_id(tenant_id));

CREATE INDEX payment_attempts_tenant_created_idx
  ON public.payment_attempts (tenant_id, created_at DESC);
CREATE INDEX payment_attempts_invoice_idx
  ON public.payment_attempts (invoice_id);

CREATE TRIGGER payment_attempts_set_updated_at
  BEFORE UPDATE ON public.payment_attempts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Public status lookup for the /pay/success page (no auth: attempt id is an unguessable uuid).
CREATE OR REPLACE FUNCTION public.payment_attempt_status(p_attempt_id uuid)
RETURNS TABLE (
  attempt_status text,
  invoice_number text,
  amount numeric,
  balance_due numeric,
  invoice_status text,
  paid boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    a.status,
    i.invoice_number,
    a.amount,
    i.balance_due,
    i.status::text,
    (i.balance_due <= 0 OR a.payment_id IS NOT NULL)
  FROM public.payment_attempts a
  JOIN public.invoices i ON i.id = a.invoice_id
  WHERE a.id = p_attempt_id;
$$;

REVOKE ALL ON FUNCTION public.payment_attempt_status(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.payment_attempt_status(uuid) TO anon, authenticated, service_role;
