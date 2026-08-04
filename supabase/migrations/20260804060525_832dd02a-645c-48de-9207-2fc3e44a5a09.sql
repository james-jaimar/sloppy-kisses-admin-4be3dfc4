
-- Permission
INSERT INTO public.permissions (code, label, description)
VALUES ('settings.xero.manage', 'Manage Xero integration', 'Connect Xero, map accounts and tax rates, and push customers, invoices, payments and credit notes')
ON CONFLICT (code) DO NOTHING;

-- Payments: Xero id
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS xero_payment_id text;

-- Settings
CREATE TABLE public.xero_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT false,
  auto_push boolean NOT NULL DEFAULT false,
  xero_tenant_id text,
  xero_tenant_name text,
  default_sales_account text NOT NULL DEFAULT '200',
  service_account_codes jsonb NOT NULL DEFAULT '{}'::jsonb,
  default_tax_type text NOT NULL DEFAULT 'OUTPUT',
  zero_rated_tax_type text NOT NULL DEFAULT 'ZERORATEDOUTPUT',
  line_amount_type text NOT NULL DEFAULT 'Inclusive',
  payment_accounts jsonb NOT NULL DEFAULT '{}'::jsonb,
  branding_theme_id text,
  last_test_at timestamptz,
  last_test_result text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.xero_settings TO authenticated;
GRANT ALL ON public.xero_settings TO service_role;
ALTER TABLE public.xero_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY xero_settings_select ON public.xero_settings FOR SELECT TO authenticated
  USING (is_platform_owner() OR user_has_permission(tenant_id, 'settings.xero.manage'));
CREATE POLICY xero_settings_insert ON public.xero_settings FOR INSERT TO authenticated
  WITH CHECK (is_platform_owner() OR user_has_permission(tenant_id, 'settings.xero.manage'));
CREATE POLICY xero_settings_update ON public.xero_settings FOR UPDATE TO authenticated
  USING (is_platform_owner() OR user_has_permission(tenant_id, 'settings.xero.manage'))
  WITH CHECK (is_platform_owner() OR user_has_permission(tenant_id, 'settings.xero.manage'));
CREATE POLICY xero_settings_delete ON public.xero_settings FOR DELETE TO authenticated
  USING (is_platform_owner());
CREATE TRIGGER xero_settings_updated_at BEFORE UPDATE ON public.xero_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Sync queue
CREATE TABLE public.xero_sync_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  entity_type text NOT NULL CHECK (entity_type IN ('customer','invoice','payment','credit_note')),
  entity_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processing','done','failed')),
  attempts integer NOT NULL DEFAULT 0,
  last_error text,
  run_after timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, entity_type, entity_id)
);
CREATE INDEX xero_sync_queue_pending_idx ON public.xero_sync_queue (tenant_id, status, run_after);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.xero_sync_queue TO authenticated;
GRANT ALL ON public.xero_sync_queue TO service_role;
ALTER TABLE public.xero_sync_queue ENABLE ROW LEVEL SECURITY;
CREATE POLICY xero_queue_select ON public.xero_sync_queue FOR SELECT TO authenticated
  USING (is_platform_owner() OR user_has_permission(tenant_id, 'settings.xero.manage'));
CREATE POLICY xero_queue_write ON public.xero_sync_queue FOR ALL TO authenticated
  USING (is_platform_owner() OR user_has_permission(tenant_id, 'settings.xero.manage'))
  WITH CHECK (is_platform_owner() OR user_has_permission(tenant_id, 'settings.xero.manage'));
CREATE TRIGGER xero_sync_queue_updated_at BEFORE UPDATE ON public.xero_sync_queue
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Sync log
CREATE TABLE public.xero_sync_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  entity_type text NOT NULL,
  entity_id uuid,
  entity_label text,
  action text NOT NULL,
  status text NOT NULL CHECK (status IN ('success','error','skipped')),
  xero_id text,
  error_message text,
  payload jsonb,
  triggered_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX xero_sync_log_tenant_idx ON public.xero_sync_log (tenant_id, created_at DESC);
GRANT SELECT ON public.xero_sync_log TO authenticated;
GRANT ALL ON public.xero_sync_log TO service_role;
ALTER TABLE public.xero_sync_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY xero_log_select ON public.xero_sync_log FOR SELECT TO authenticated
  USING (is_platform_owner() OR user_has_permission(tenant_id, 'settings.xero.manage'));

-- Auto-queue helper + triggers
CREATE OR REPLACE FUNCTION public.xero_enqueue(_tenant_id uuid, _entity_type text, _entity_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.xero_settings s WHERE s.tenant_id = _tenant_id AND s.enabled AND s.auto_push) THEN
    RETURN;
  END IF;
  INSERT INTO public.xero_sync_queue (tenant_id, entity_type, entity_id, status, run_after, attempts, last_error)
  VALUES (_tenant_id, _entity_type, _entity_id, 'pending', now(), 0, NULL)
  ON CONFLICT (tenant_id, entity_type, entity_id)
  DO UPDATE SET status = 'pending', run_after = now(), attempts = 0, last_error = NULL, updated_at = now();
END;
$$;
REVOKE ALL ON FUNCTION public.xero_enqueue(uuid, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.xero_enqueue(uuid, text, uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.xero_queue_invoice()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status IN ('issued','sent','part_paid','paid','overdue') THEN
    PERFORM public.xero_enqueue(NEW.tenant_id, 'invoice', NEW.id);
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER invoices_xero_queue AFTER INSERT OR UPDATE OF status, total ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.xero_queue_invoice();

CREATE OR REPLACE FUNCTION public.xero_queue_payment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.xero_enqueue(NEW.tenant_id, 'payment', NEW.id);
  RETURN NEW;
END;
$$;
CREATE TRIGGER payments_xero_queue AFTER INSERT ON public.payments
  FOR EACH ROW EXECUTE FUNCTION public.xero_queue_payment();

CREATE OR REPLACE FUNCTION public.xero_queue_credit_note()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status IN ('issued','applied') THEN
    PERFORM public.xero_enqueue(NEW.tenant_id, 'credit_note', NEW.id);
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER credit_notes_xero_queue AFTER INSERT OR UPDATE OF status ON public.credit_notes
  FOR EACH ROW EXECUTE FUNCTION public.xero_queue_credit_note();
