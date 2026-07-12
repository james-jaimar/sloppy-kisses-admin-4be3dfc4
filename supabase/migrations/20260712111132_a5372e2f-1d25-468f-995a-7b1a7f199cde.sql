
-- 1. invoice_events table
CREATE TABLE public.invoice_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  invoice_id uuid NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  actor_profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  actor_label text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_invoice_events_invoice ON public.invoice_events(invoice_id, created_at DESC);
CREATE INDEX idx_invoice_events_tenant ON public.invoice_events(tenant_id, created_at DESC);

GRANT SELECT ON public.invoice_events TO authenticated;
GRANT ALL ON public.invoice_events TO service_role;

ALTER TABLE public.invoice_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can read invoice events in their tenant"
  ON public.invoice_events FOR SELECT
  TO authenticated
  USING (public.user_has_permission(tenant_id, 'invoices.view'));

CREATE POLICY "Platform owners full access invoice events"
  ON public.invoice_events FOR ALL
  TO authenticated
  USING (public.is_platform_owner())
  WITH CHECK (public.is_platform_owner());

-- No insert/update/delete for regular users; only triggers (SECURITY DEFINER) and service_role write.

-- 2. Helper: log an invoice event
CREATE OR REPLACE FUNCTION public.log_invoice_event(
  p_tenant_id uuid,
  p_invoice_id uuid,
  p_event_type text,
  p_payload jsonb DEFAULT '{}'::jsonb,
  p_notes text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile_id uuid;
  v_label text;
BEGIN
  SELECT p.id, coalesce(p.full_name, p.email)
    INTO v_profile_id, v_label
  FROM public.profiles p
  WHERE p.auth_user_id = auth.uid()
  LIMIT 1;

  INSERT INTO public.invoice_events(tenant_id, invoice_id, event_type, actor_profile_id, actor_label, payload, notes)
  VALUES (p_tenant_id, p_invoice_id, p_event_type, v_profile_id, v_label, coalesce(p_payload, '{}'::jsonb), p_notes);
END;
$$;

-- 3. Lock-after-send trigger on invoices
-- On UPDATE: if OLD.status is locked ('sent','part_paid','paid','overdue','cancelled') then only
-- an allow-list of columns may change. Draft/unset stays fully editable.
CREATE OR REPLACE FUNCTION public.invoices_lock_after_send()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_locked_statuses text[] := ARRAY['sent','part_paid','paid','overdue','cancelled'];
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.status = ANY(v_locked_statuses) THEN
    -- The following columns are allowed to change even on locked invoices:
    --   status, notes, xero_invoice_id, xero_invoice_number, amount_paid, balance_due,
    --   issue_date (only for status transitions), due_date, updated_at
    -- Any other change is blocked.
    IF NEW.customer_id IS DISTINCT FROM OLD.customer_id
       OR NEW.invoice_number IS DISTINCT FROM OLD.invoice_number
       OR NEW.subtotal IS DISTINCT FROM OLD.subtotal
       OR NEW.total IS DISTINCT FROM OLD.total
       OR NEW.currency IS DISTINCT FROM OLD.currency
       OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
    THEN
      -- Allow recomputation of totals ONLY when a payment/refund is being applied
      -- (amount_paid also changing) or platform-owner override.
      IF public.is_platform_owner() THEN
        -- allow
        NULL;
      ELSIF NEW.total IS DISTINCT FROM OLD.total
            OR NEW.subtotal IS DISTINCT FROM OLD.subtotal THEN
        RAISE EXCEPTION 'Invoice %/% is locked (status=%). Line-item and total changes are not allowed. Issue a credit note instead.',
          OLD.tenant_id, OLD.invoice_number, OLD.status
          USING ERRCODE = 'P0001';
      ELSE
        RAISE EXCEPTION 'Invoice %/% is locked (status=%). Only status/notes/xero/payment fields may change.',
          OLD.tenant_id, OLD.invoice_number, OLD.status
          USING ERRCODE = 'P0001';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_invoices_lock_after_send ON public.invoices;
CREATE TRIGGER trg_invoices_lock_after_send
  BEFORE UPDATE ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.invoices_lock_after_send();

-- 4. Lock invoice_items on locked parent invoices
CREATE OR REPLACE FUNCTION public.invoice_items_lock_after_send()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status text;
  v_number text;
  v_inv_id uuid;
BEGIN
  v_inv_id := coalesce(NEW.invoice_id, OLD.invoice_id);
  SELECT status::text, invoice_number INTO v_status, v_number
  FROM public.invoices WHERE id = v_inv_id;

  IF v_status IN ('sent','part_paid','paid','overdue','cancelled') AND NOT public.is_platform_owner() THEN
    RAISE EXCEPTION 'Invoice % is locked (status=%). Line items cannot be added, edited or deleted. Issue a credit note instead.',
      v_number, v_status
      USING ERRCODE = 'P0001';
  END IF;
  RETURN coalesce(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_invoice_items_lock ON public.invoice_items;
CREATE TRIGGER trg_invoice_items_lock
  BEFORE INSERT OR UPDATE OR DELETE ON public.invoice_items
  FOR EACH ROW EXECUTE FUNCTION public.invoice_items_lock_after_send();

-- 5. Auto-log events

-- Invoice created / status changed
CREATE OR REPLACE FUNCTION public.invoices_log_events()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.log_invoice_event(NEW.tenant_id, NEW.id, 'created',
      jsonb_build_object('invoice_number', NEW.invoice_number, 'status', NEW.status));
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW.status IS DISTINCT FROM OLD.status THEN
      PERFORM public.log_invoice_event(NEW.tenant_id, NEW.id,
        CASE
          WHEN NEW.status = 'sent' AND OLD.status = 'draft' THEN 'issued'
          WHEN NEW.status = 'cancelled' THEN 'voided'
          WHEN NEW.status = 'paid' THEN 'marked_paid'
          ELSE 'status_changed'
        END,
        jsonb_build_object('from', OLD.status, 'to', NEW.status));
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_invoices_log_events ON public.invoices;
CREATE TRIGGER trg_invoices_log_events
  AFTER INSERT OR UPDATE ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.invoices_log_events();

-- Payments -> invoice_events
CREATE OR REPLACE FUNCTION public.payments_log_invoice_events()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.invoice_id IS NOT NULL THEN
    PERFORM public.log_invoice_event(NEW.tenant_id, NEW.invoice_id, 'payment_recorded',
      jsonb_build_object('amount', NEW.amount, 'method', NEW.payment_method, 'reference', NEW.payment_reference, 'payment_id', NEW.id));
  ELSIF TG_OP = 'DELETE' AND OLD.invoice_id IS NOT NULL THEN
    PERFORM public.log_invoice_event(OLD.tenant_id, OLD.invoice_id, 'payment_removed',
      jsonb_build_object('amount', OLD.amount, 'method', OLD.payment_method, 'payment_id', OLD.id));
  END IF;
  RETURN coalesce(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_payments_log_invoice_events ON public.payments;
CREATE TRIGGER trg_payments_log_invoice_events
  AFTER INSERT OR DELETE ON public.payments
  FOR EACH ROW EXECUTE FUNCTION public.payments_log_invoice_events();
