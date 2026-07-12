
-- ============ ENUMS ============
DO $$ BEGIN
  CREATE TYPE public.refund_status AS ENUM ('pending','processing','succeeded','failed','cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.payment_refund_state AS ENUM ('none','partial','full');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.payment_provider_mode AS ENUM ('test','live');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============ payments extension ============
ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS amount_refunded numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS refund_status public.payment_refund_state NOT NULL DEFAULT 'none';

-- ============ payment_providers ============
CREATE TABLE IF NOT EXISTS public.payment_providers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  provider text NOT NULL,
  enabled boolean NOT NULL DEFAULT false,
  mode public.payment_provider_mode NOT NULL DEFAULT 'test',
  settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  webhook_secret_ref text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, provider)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.payment_providers TO authenticated;
GRANT ALL ON public.payment_providers TO service_role;
ALTER TABLE public.payment_providers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pp_select" ON public.payment_providers FOR SELECT TO authenticated
USING (public.is_platform_owner() OR public.user_has_permission(tenant_id, 'settings.payment_providers.manage'));
CREATE POLICY "pp_insert" ON public.payment_providers FOR INSERT TO authenticated
WITH CHECK (public.is_platform_owner() OR public.user_has_permission(tenant_id, 'settings.payment_providers.manage'));
CREATE POLICY "pp_update" ON public.payment_providers FOR UPDATE TO authenticated
USING (public.is_platform_owner() OR public.user_has_permission(tenant_id, 'settings.payment_providers.manage'))
WITH CHECK (public.is_platform_owner() OR public.user_has_permission(tenant_id, 'settings.payment_providers.manage'));
CREATE POLICY "pp_delete" ON public.payment_providers FOR DELETE TO authenticated
USING (public.is_platform_owner());

CREATE TRIGGER trg_pp_updated BEFORE UPDATE ON public.payment_providers
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Seed a manual provider row for every existing tenant
INSERT INTO public.payment_providers (tenant_id, provider, enabled, mode)
SELECT t.id, 'manual', true, 'live' FROM public.tenants t
ON CONFLICT (tenant_id, provider) DO NOTHING;

-- ============ payment_refunds ============
CREATE TABLE IF NOT EXISTS public.payment_refunds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  payment_id uuid REFERENCES public.payments(id) ON DELETE SET NULL,
  invoice_id uuid REFERENCES public.invoices(id) ON DELETE SET NULL,
  credit_note_id uuid REFERENCES public.credit_notes(id) ON DELETE SET NULL,
  customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  amount numeric(12,2) NOT NULL CHECK (amount > 0),
  currency text NOT NULL DEFAULT 'ZAR',
  refund_date date NOT NULL DEFAULT (now()::date),
  method public.payment_method,
  reference text,
  status public.refund_status NOT NULL DEFAULT 'pending',
  notes text,
  provider text NOT NULL DEFAULT 'manual',
  provider_refund_id text,
  provider_status text,
  provider_payload jsonb,
  provider_error text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.payment_refunds TO authenticated;
GRANT ALL ON public.payment_refunds TO service_role;
ALTER TABLE public.payment_refunds ENABLE ROW LEVEL SECURITY;

-- Idempotency for gateway refunds
CREATE UNIQUE INDEX IF NOT EXISTS payment_refunds_provider_ref_uidx
  ON public.payment_refunds (provider, provider_refund_id)
  WHERE provider <> 'manual' AND provider_refund_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS payment_refunds_payment_idx ON public.payment_refunds(payment_id);
CREATE INDEX IF NOT EXISTS payment_refunds_invoice_idx ON public.payment_refunds(invoice_id);
CREATE INDEX IF NOT EXISTS payment_refunds_credit_note_idx ON public.payment_refunds(credit_note_id);
CREATE INDEX IF NOT EXISTS payment_refunds_tenant_idx ON public.payment_refunds(tenant_id);

CREATE POLICY "pr_select" ON public.payment_refunds FOR SELECT TO authenticated
USING (public.is_platform_owner() OR public.user_has_permission(tenant_id, 'payments.refund') OR public.user_has_permission(tenant_id, 'payments.view'));

CREATE POLICY "pr_insert" ON public.payment_refunds FOR INSERT TO authenticated
WITH CHECK (public.is_platform_owner() OR public.user_has_permission(tenant_id, 'payments.refund'));

CREATE POLICY "pr_update" ON public.payment_refunds FOR UPDATE TO authenticated
USING (public.is_platform_owner() OR public.user_has_permission(tenant_id, 'payments.refund.void'))
WITH CHECK (public.is_platform_owner() OR public.user_has_permission(tenant_id, 'payments.refund.void'));

CREATE POLICY "pr_delete" ON public.payment_refunds FOR DELETE TO authenticated
USING (public.is_platform_owner());

CREATE TRIGGER trg_pr_updated BEFORE UPDATE ON public.payment_refunds
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============ Trigger: apply refund to payment + invoice ============
CREATE OR REPLACE FUNCTION public.payment_refunds_apply()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_pay public.payments;
  v_inv public.invoices;
  v_delta numeric(12,2) := 0;
  v_new_refunded numeric(12,2);
  v_new_state public.payment_refund_state;
  v_new_paid numeric(12,2);
  v_new_balance numeric(12,2);
  v_old_success boolean;
  v_new_success boolean;
BEGIN
  v_old_success := TG_OP IN ('UPDATE','DELETE') AND OLD.status = 'succeeded';
  v_new_success := TG_OP IN ('INSERT','UPDATE') AND NEW.status = 'succeeded';

  -- delta of "money out" against payment/invoice
  IF v_old_success AND NOT v_new_success THEN
    v_delta := -OLD.amount; -- reversing a previously-succeeded refund
  ELSIF v_new_success AND NOT v_old_success THEN
    v_delta := NEW.amount;  -- newly-succeeded refund
  ELSIF v_new_success AND v_old_success AND NEW.amount <> OLD.amount THEN
    v_delta := NEW.amount - OLD.amount;
  ELSE
    RETURN coalesce(NEW, OLD);
  END IF;

  -- Update payment (if linked)
  IF coalesce(NEW.payment_id, OLD.payment_id) IS NOT NULL THEN
    SELECT * INTO v_pay FROM public.payments
      WHERE id = coalesce(NEW.payment_id, OLD.payment_id) FOR UPDATE;

    v_new_refunded := round(v_pay.amount_refunded + v_delta, 2);
    IF v_new_refunded < 0 THEN
      RAISE EXCEPTION 'Refund reversal would produce negative refunded amount on payment %.', v_pay.id;
    END IF;
    IF v_new_refunded > v_pay.amount + 0.0001 THEN
      RAISE EXCEPTION 'Refund amount % exceeds payment amount % on payment %.',
        v_new_refunded, v_pay.amount, v_pay.id;
    END IF;
    v_new_state := CASE
      WHEN v_new_refunded <= 0.0001 THEN 'none'::payment_refund_state
      WHEN v_new_refunded >= v_pay.amount - 0.0001 THEN 'full'::payment_refund_state
      ELSE 'partial'::payment_refund_state
    END;
    UPDATE public.payments
      SET amount_refunded = v_new_refunded,
          refund_status = v_new_state,
          updated_at = now()
      WHERE id = v_pay.id;
  END IF;

  -- Update invoice (if linked): reduce paid, increase balance
  IF coalesce(NEW.invoice_id, OLD.invoice_id) IS NOT NULL THEN
    SELECT * INTO v_inv FROM public.invoices
      WHERE id = coalesce(NEW.invoice_id, OLD.invoice_id) FOR UPDATE;

    v_new_paid := round(v_inv.amount_paid - v_delta, 2);
    v_new_balance := round(v_inv.balance_due + v_delta, 2);
    IF v_new_paid < 0 THEN v_new_paid := 0; END IF;

    UPDATE public.invoices
      SET amount_paid = v_new_paid,
          balance_due = v_new_balance,
          status = CASE
            WHEN v_new_balance <= 0.0001 THEN 'paid'::billing_status
            WHEN v_new_paid > 0 THEN 'part_paid'::billing_status
            WHEN v_inv.status = 'paid' THEN 'sent'::billing_status
            ELSE v_inv.status
          END,
          updated_at = now()
      WHERE id = v_inv.id;

    -- Audit
    IF v_new_success AND NOT v_old_success THEN
      PERFORM public.log_invoice_event(v_inv.tenant_id, v_inv.id, 'refund_recorded',
        jsonb_build_object('refund_id', NEW.id, 'amount', NEW.amount,
          'method', NEW.method, 'provider', NEW.provider,
          'credit_note_id', NEW.credit_note_id));
    ELSIF v_old_success AND NOT v_new_success THEN
      PERFORM public.log_invoice_event(v_inv.tenant_id, v_inv.id, 'refund_voided',
        jsonb_build_object('refund_id', OLD.id, 'amount', OLD.amount));
    END IF;
  END IF;

  RETURN coalesce(NEW, OLD);
END; $$;

CREATE TRIGGER trg_payment_refunds_apply
  AFTER INSERT OR UPDATE OR DELETE ON public.payment_refunds
  FOR EACH ROW EXECUTE FUNCTION public.payment_refunds_apply();

-- Log failed refunds too (separate lightweight trigger)
CREATE OR REPLACE FUNCTION public.payment_refunds_log_failure()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.status = 'failed' AND OLD.status <> 'failed'
     AND NEW.invoice_id IS NOT NULL THEN
    PERFORM public.log_invoice_event(NEW.tenant_id, NEW.invoice_id, 'refund_failed',
      jsonb_build_object('refund_id', NEW.id, 'amount', NEW.amount, 'error', NEW.provider_error));
  END IF;
  RETURN NEW;
END; $$;

CREATE TRIGGER trg_payment_refunds_log_failure
  AFTER UPDATE ON public.payment_refunds
  FOR EACH ROW EXECUTE FUNCTION public.payment_refunds_log_failure();

-- ============ RPCs ============
CREATE OR REPLACE FUNCTION public.record_manual_refund(
  p_payment_id uuid,
  p_amount numeric,
  p_method public.payment_method DEFAULT NULL,
  p_reference text DEFAULT NULL,
  p_credit_note_id uuid DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_refund_date date DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_pay public.payments;
  v_refund_id uuid;
BEGIN
  SELECT * INTO v_pay FROM public.payments WHERE id = p_payment_id;
  IF v_pay.id IS NULL THEN RAISE EXCEPTION 'Payment not found'; END IF;
  IF NOT public.user_has_permission(v_pay.tenant_id, 'payments.refund') AND NOT public.is_platform_owner() THEN
    RAISE EXCEPTION 'Missing permission payments.refund';
  END IF;
  IF p_amount <= 0 THEN RAISE EXCEPTION 'Refund amount must be positive'; END IF;

  INSERT INTO public.payment_refunds(
    tenant_id, payment_id, invoice_id, credit_note_id, customer_id,
    amount, method, reference, status, notes, provider, refund_date, created_by
  ) VALUES (
    v_pay.tenant_id, v_pay.id, v_pay.invoice_id, p_credit_note_id, v_pay.customer_id,
    round(p_amount, 2), coalesce(p_method, v_pay.payment_method), p_reference,
    'succeeded', p_notes, 'manual', coalesce(p_refund_date, now()::date), auth.uid()
  ) RETURNING id INTO v_refund_id;

  RETURN v_refund_id;
END; $$;

CREATE OR REPLACE FUNCTION public.void_refund(p_refund_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_ref public.payment_refunds;
BEGIN
  SELECT * INTO v_ref FROM public.payment_refunds WHERE id = p_refund_id;
  IF v_ref.id IS NULL THEN RAISE EXCEPTION 'Refund not found'; END IF;
  IF NOT public.user_has_permission(v_ref.tenant_id, 'payments.refund.void') AND NOT public.is_platform_owner() THEN
    RAISE EXCEPTION 'Missing permission payments.refund.void';
  END IF;
  IF v_ref.provider <> 'manual' AND NOT public.is_platform_owner() THEN
    RAISE EXCEPTION 'Only manual refunds can be voided from the UI. Reverse gateway refunds through the provider.';
  END IF;
  IF v_ref.status <> 'succeeded' THEN
    RAISE EXCEPTION 'Only succeeded refunds can be voided (status=%).', v_ref.status;
  END IF;

  UPDATE public.payment_refunds
    SET status = 'cancelled', updated_by = auth.uid(), updated_at = now()
    WHERE id = p_refund_id;
END; $$;

-- ============ Permissions & role seeding ============
INSERT INTO public.permissions(code, label, description) VALUES
  ('payments.refund.void', 'Void refunds', 'Reverse a previously-recorded refund'),
  ('settings.payment_providers.manage', 'Manage payment providers', 'Configure PayFast / Yoco / Stripe integrations')
ON CONFLICT (code) DO NOTHING;

-- Seed to tenant_owner + tenant_admin
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
JOIN public.permissions p ON p.code IN ('payments.refund.void','settings.payment_providers.manage')
WHERE r.code IN ('tenant_owner','tenant_admin')
ON CONFLICT DO NOTHING;

-- Also give staff_accounts payments.refund.void (they already handle payments)
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
JOIN public.permissions p ON p.code = 'payments.refund.void'
WHERE r.code = 'staff_accounts'
ON CONFLICT DO NOTHING;
