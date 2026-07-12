
-- ============================================================
-- Section C1: Credit notes
-- ============================================================

-- Status enum
DO $$ BEGIN
  CREATE TYPE public.credit_note_status AS ENUM ('draft','issued','applied','cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ------------------------------------------------------------
-- invoicing_settings: prefix + next number
-- ------------------------------------------------------------
ALTER TABLE public.invoicing_settings
  ADD COLUMN IF NOT EXISTS credit_note_prefix text NOT NULL DEFAULT 'CN-',
  ADD COLUMN IF NOT EXISTS next_credit_note_number integer NOT NULL DEFAULT 1;

-- ------------------------------------------------------------
-- credit_notes
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.credit_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  credit_note_number text NOT NULL,
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE RESTRICT,
  invoice_id uuid REFERENCES public.invoices(id) ON DELETE SET NULL,
  status public.credit_note_status NOT NULL DEFAULT 'draft',
  issue_date date,
  subtotal numeric(12,2) NOT NULL DEFAULT 0,
  total numeric(12,2) NOT NULL DEFAULT 0,
  amount_applied numeric(12,2) NOT NULL DEFAULT 0,
  balance numeric(12,2) NOT NULL DEFAULT 0,
  reason text,
  notes text,
  xero_credit_note_id text,
  xero_credit_note_number text,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, credit_note_number)
);
CREATE INDEX IF NOT EXISTS idx_credit_notes_tenant ON public.credit_notes(tenant_id);
CREATE INDEX IF NOT EXISTS idx_credit_notes_customer ON public.credit_notes(customer_id);
CREATE INDEX IF NOT EXISTS idx_credit_notes_invoice ON public.credit_notes(invoice_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.credit_notes TO authenticated;
GRANT ALL ON public.credit_notes TO service_role;
ALTER TABLE public.credit_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "credit_notes_staff_select" ON public.credit_notes
  FOR SELECT USING (user_has_tenant_access(tenant_id) AND user_has_permission(tenant_id, 'credit_notes.view'));
CREATE POLICY "credit_notes_staff_insert" ON public.credit_notes
  FOR INSERT WITH CHECK (user_has_tenant_access(tenant_id) AND user_has_permission(tenant_id, 'credit_notes.create'));
CREATE POLICY "credit_notes_staff_update" ON public.credit_notes
  FOR UPDATE USING (user_has_tenant_access(tenant_id) AND (
    user_has_permission(tenant_id, 'credit_notes.create')
    OR user_has_permission(tenant_id, 'credit_notes.issue')
    OR user_has_permission(tenant_id, 'credit_notes.void')
  )) WITH CHECK (user_has_tenant_access(tenant_id));
CREATE POLICY "credit_notes_staff_delete" ON public.credit_notes
  FOR DELETE USING (user_has_tenant_access(tenant_id) AND user_has_permission(tenant_id, 'credit_notes.void'));
CREATE POLICY "credit_notes_customer_select_own" ON public.credit_notes
  FOR SELECT USING (status <> 'draft' AND customer_id = current_customer_id(tenant_id));
CREATE POLICY "credit_notes_platform_all" ON public.credit_notes
  FOR ALL USING (is_platform_owner()) WITH CHECK (is_platform_owner());

CREATE TRIGGER trg_credit_notes_updated_at
  BEFORE UPDATE ON public.credit_notes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ------------------------------------------------------------
-- credit_note_items
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.credit_note_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  credit_note_id uuid NOT NULL REFERENCES public.credit_notes(id) ON DELETE CASCADE,
  description text NOT NULL,
  quantity numeric(12,2) NOT NULL DEFAULT 1,
  unit_price numeric(12,2) NOT NULL DEFAULT 0,
  line_total numeric(12,2) NOT NULL DEFAULT 0,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_cn_items_cn ON public.credit_note_items(credit_note_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.credit_note_items TO authenticated;
GRANT ALL ON public.credit_note_items TO service_role;
ALTER TABLE public.credit_note_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cn_items_staff_select" ON public.credit_note_items
  FOR SELECT USING (user_has_tenant_access(tenant_id) AND user_has_permission(tenant_id, 'credit_notes.view'));
CREATE POLICY "cn_items_staff_write" ON public.credit_note_items
  FOR ALL USING (user_has_tenant_access(tenant_id) AND (
    user_has_permission(tenant_id, 'credit_notes.create')
    OR user_has_permission(tenant_id, 'credit_notes.issue')
  )) WITH CHECK (user_has_tenant_access(tenant_id) AND (
    user_has_permission(tenant_id, 'credit_notes.create')
    OR user_has_permission(tenant_id, 'credit_notes.issue')
  ));
CREATE POLICY "cn_items_customer_select_own" ON public.credit_note_items
  FOR SELECT USING (EXISTS (
    SELECT 1 FROM public.credit_notes cn
    WHERE cn.id = credit_note_items.credit_note_id
      AND cn.status <> 'draft'
      AND cn.customer_id = current_customer_id(cn.tenant_id)
  ));
CREATE POLICY "cn_items_platform_all" ON public.credit_note_items
  FOR ALL USING (is_platform_owner()) WITH CHECK (is_platform_owner());

-- ------------------------------------------------------------
-- credit_note_applications
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.credit_note_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  credit_note_id uuid NOT NULL REFERENCES public.credit_notes(id) ON DELETE CASCADE,
  invoice_id uuid NOT NULL REFERENCES public.invoices(id) ON DELETE RESTRICT,
  amount numeric(12,2) NOT NULL CHECK (amount > 0),
  applied_at timestamptz NOT NULL DEFAULT now(),
  applied_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_cn_apps_cn ON public.credit_note_applications(credit_note_id);
CREATE INDEX IF NOT EXISTS idx_cn_apps_inv ON public.credit_note_applications(invoice_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.credit_note_applications TO authenticated;
GRANT ALL ON public.credit_note_applications TO service_role;
ALTER TABLE public.credit_note_applications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cn_apps_staff_select" ON public.credit_note_applications
  FOR SELECT USING (user_has_tenant_access(tenant_id) AND user_has_permission(tenant_id, 'credit_notes.view'));
CREATE POLICY "cn_apps_staff_write" ON public.credit_note_applications
  FOR ALL USING (user_has_tenant_access(tenant_id) AND user_has_permission(tenant_id, 'credit_notes.apply'))
  WITH CHECK (user_has_tenant_access(tenant_id) AND user_has_permission(tenant_id, 'credit_notes.apply'));
CREATE POLICY "cn_apps_customer_select_own" ON public.credit_note_applications
  FOR SELECT USING (EXISTS (
    SELECT 1 FROM public.credit_notes cn
    WHERE cn.id = credit_note_applications.credit_note_id
      AND cn.customer_id = current_customer_id(cn.tenant_id)
  ));
CREATE POLICY "cn_apps_platform_all" ON public.credit_note_applications
  FOR ALL USING (is_platform_owner()) WITH CHECK (is_platform_owner());

-- ------------------------------------------------------------
-- Numbering RPC
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.next_credit_note_number(target_tenant_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_prefix text;
  v_next integer;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext(target_tenant_id::text || ':credit_note_number'));

  INSERT INTO public.invoicing_settings (tenant_id) VALUES (target_tenant_id)
  ON CONFLICT (tenant_id) DO NOTHING;

  UPDATE public.invoicing_settings
    SET next_credit_note_number = next_credit_note_number + 1
    WHERE tenant_id = target_tenant_id
    RETURNING credit_note_prefix, next_credit_note_number - 1
    INTO v_prefix, v_next;

  RETURN v_prefix || lpad(v_next::text, 5, '0');
END;
$$;

-- ------------------------------------------------------------
-- Totals recompute trigger on credit_note_items
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.credit_note_recompute_totals()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cn uuid := coalesce(NEW.credit_note_id, OLD.credit_note_id);
  v_subtotal numeric(12,2);
  v_applied numeric(12,2);
BEGIN
  SELECT coalesce(sum(line_total),0) INTO v_subtotal
    FROM public.credit_note_items WHERE credit_note_id = v_cn;
  SELECT coalesce(sum(amount),0) INTO v_applied
    FROM public.credit_note_applications WHERE credit_note_id = v_cn;
  UPDATE public.credit_notes
    SET subtotal = v_subtotal,
        total = v_subtotal,
        amount_applied = v_applied,
        balance = v_subtotal - v_applied,
        updated_at = now()
    WHERE id = v_cn;
  RETURN coalesce(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_cn_items_recompute ON public.credit_note_items;
CREATE TRIGGER trg_cn_items_recompute
  AFTER INSERT OR UPDATE OR DELETE ON public.credit_note_items
  FOR EACH ROW EXECUTE FUNCTION public.credit_note_recompute_totals();

-- Auto-compute line_total on items
CREATE OR REPLACE FUNCTION public.credit_note_items_set_line_total()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.line_total := round(coalesce(NEW.quantity,0) * coalesce(NEW.unit_price,0), 2);
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_cn_items_line_total ON public.credit_note_items;
CREATE TRIGGER trg_cn_items_line_total
  BEFORE INSERT OR UPDATE ON public.credit_note_items
  FOR EACH ROW EXECUTE FUNCTION public.credit_note_items_set_line_total();

-- ------------------------------------------------------------
-- Applications: adjust CN balance + target invoice balance
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.credit_note_applications_apply()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cn public.credit_notes;
  v_inv public.invoices;
  v_delta numeric(12,2);
  v_new_balance numeric(12,2);
  v_new_paid numeric(12,2);
  v_cn_applied numeric(12,2);
  v_cn_balance numeric(12,2);
  v_new_status public.credit_note_status;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_delta := NEW.amount;
  ELSIF TG_OP = 'DELETE' THEN
    v_delta := -OLD.amount;
  ELSE
    RAISE EXCEPTION 'Updates to credit_note_applications are not supported; delete and re-insert.';
  END IF;

  -- Load parent CN
  SELECT * INTO v_cn FROM public.credit_notes
    WHERE id = coalesce(NEW.credit_note_id, OLD.credit_note_id) FOR UPDATE;

  -- Load invoice
  SELECT * INTO v_inv FROM public.invoices
    WHERE id = coalesce(NEW.invoice_id, OLD.invoice_id) FOR UPDATE;

  IF TG_OP = 'INSERT' THEN
    IF v_cn.status <> 'issued' AND v_cn.status <> 'applied' THEN
      RAISE EXCEPTION 'Credit note must be issued before applying (status=%).', v_cn.status;
    END IF;
    IF v_cn.tenant_id <> v_inv.tenant_id THEN
      RAISE EXCEPTION 'Credit note and invoice must belong to the same tenant.';
    END IF;
    IF v_cn.customer_id <> v_inv.customer_id THEN
      RAISE EXCEPTION 'Credit note and invoice must belong to the same customer.';
    END IF;
    IF v_inv.status IN ('draft','cancelled') THEN
      RAISE EXCEPTION 'Cannot apply credit to a % invoice.', v_inv.status;
    END IF;
    IF v_delta > v_cn.balance + 0.0001 THEN
      RAISE EXCEPTION 'Application amount % exceeds credit note balance %.', v_delta, v_cn.balance;
    END IF;
    IF v_delta > v_inv.balance_due + 0.0001 THEN
      RAISE EXCEPTION 'Application amount % exceeds invoice balance %.', v_delta, v_inv.balance_due;
    END IF;
  END IF;

  -- Adjust invoice: treat credit application like a payment for balance purposes,
  -- but keep amount_paid unchanged (credits are separate from cash).
  v_new_balance := round(v_inv.balance_due - v_delta, 2);
  v_new_paid := v_inv.amount_paid;

  UPDATE public.invoices
    SET balance_due = v_new_balance,
        status = CASE
          WHEN v_new_balance <= 0.0001 THEN 'paid'::billing_status
          WHEN v_new_paid > 0 OR v_new_balance < v_inv.total THEN 'part_paid'::billing_status
          ELSE v_inv.status
        END,
        updated_at = now()
    WHERE id = v_inv.id;

  -- Recompute CN totals
  SELECT coalesce(sum(amount),0) INTO v_cn_applied
    FROM public.credit_note_applications WHERE credit_note_id = v_cn.id;
  v_cn_balance := round(v_cn.total - v_cn_applied, 2);
  v_new_status := CASE
    WHEN v_cn_balance <= 0.0001 THEN 'applied'::credit_note_status
    ELSE 'issued'::credit_note_status
  END;

  UPDATE public.credit_notes
    SET amount_applied = v_cn_applied,
        balance = v_cn_balance,
        status = v_new_status,
        updated_at = now()
    WHERE id = v_cn.id;

  -- Log to invoice activity feed
  IF TG_OP = 'INSERT' THEN
    PERFORM public.log_invoice_event(v_inv.tenant_id, v_inv.id, 'credit_note_applied',
      jsonb_build_object('credit_note_id', v_cn.id, 'credit_note_number', v_cn.credit_note_number, 'amount', NEW.amount));
  ELSE
    PERFORM public.log_invoice_event(v_inv.tenant_id, v_inv.id, 'credit_note_reversed',
      jsonb_build_object('credit_note_id', v_cn.id, 'credit_note_number', v_cn.credit_note_number, 'amount', OLD.amount));
  END IF;

  RETURN coalesce(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_cn_apps_apply ON public.credit_note_applications;
CREATE TRIGGER trg_cn_apps_apply
  AFTER INSERT OR DELETE ON public.credit_note_applications
  FOR EACH ROW EXECUTE FUNCTION public.credit_note_applications_apply();

-- ------------------------------------------------------------
-- Lock triggers: no line-item edits after issue
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.credit_note_items_lock_after_issue()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status public.credit_note_status;
  v_number text;
  v_cn uuid;
BEGIN
  v_cn := coalesce(NEW.credit_note_id, OLD.credit_note_id);
  SELECT status, credit_note_number INTO v_status, v_number
    FROM public.credit_notes WHERE id = v_cn;
  IF v_status IN ('issued','applied','cancelled') AND NOT public.is_platform_owner() THEN
    RAISE EXCEPTION 'Credit note % is locked (status=%). Line items cannot be changed.',
      v_number, v_status USING ERRCODE = 'P0001';
  END IF;
  RETURN coalesce(NEW, OLD);
END; $$;

DROP TRIGGER IF EXISTS trg_cn_items_lock ON public.credit_note_items;
CREATE TRIGGER trg_cn_items_lock
  BEFORE INSERT OR UPDATE OR DELETE ON public.credit_note_items
  FOR EACH ROW EXECUTE FUNCTION public.credit_note_items_lock_after_issue();

-- Prevent editing key fields on locked CNs and log issue/void events
CREATE OR REPLACE FUNCTION public.credit_notes_lock_and_log()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.status IN ('issued','applied','cancelled') THEN
    IF NEW.customer_id IS DISTINCT FROM OLD.customer_id
       OR NEW.invoice_id IS DISTINCT FROM OLD.invoice_id
       OR NEW.credit_note_number IS DISTINCT FROM OLD.credit_note_number
       OR NEW.subtotal IS DISTINCT FROM OLD.subtotal
       OR NEW.total IS DISTINCT FROM OLD.total
    THEN
      IF NOT public.is_platform_owner() THEN
        RAISE EXCEPTION 'Credit note %/% is locked (status=%). Only status/notes may change.',
          OLD.tenant_id, OLD.credit_note_number, OLD.status
          USING ERRCODE = 'P0001';
      END IF;
    END IF;
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.status = 'issued' AND OLD.status = 'draft' THEN
      IF NEW.invoice_id IS NOT NULL THEN
        PERFORM public.log_invoice_event(NEW.tenant_id, NEW.invoice_id, 'credit_note_issued',
          jsonb_build_object('credit_note_id', NEW.id, 'credit_note_number', NEW.credit_note_number, 'total', NEW.total));
      END IF;
    ELSIF NEW.status = 'cancelled' THEN
      IF NEW.invoice_id IS NOT NULL THEN
        PERFORM public.log_invoice_event(NEW.tenant_id, NEW.invoice_id, 'credit_note_cancelled',
          jsonb_build_object('credit_note_id', NEW.id, 'credit_note_number', NEW.credit_note_number));
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_credit_notes_lock_and_log ON public.credit_notes;
CREATE TRIGGER trg_credit_notes_lock_and_log
  BEFORE UPDATE ON public.credit_notes
  FOR EACH ROW EXECUTE FUNCTION public.credit_notes_lock_and_log();

-- ------------------------------------------------------------
-- apply_credit_note RPC (atomic, permission-checked)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.apply_credit_note(p_credit_note_id uuid, p_invoice_id uuid, p_amount numeric)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cn public.credit_notes;
  v_app_id uuid;
BEGIN
  SELECT * INTO v_cn FROM public.credit_notes WHERE id = p_credit_note_id;
  IF v_cn.id IS NULL THEN RAISE EXCEPTION 'Credit note not found'; END IF;

  IF NOT public.user_has_permission(v_cn.tenant_id, 'credit_notes.apply') AND NOT public.is_platform_owner() THEN
    RAISE EXCEPTION 'Missing permission credit_notes.apply';
  END IF;

  INSERT INTO public.credit_note_applications(tenant_id, credit_note_id, invoice_id, amount, applied_by)
  VALUES (v_cn.tenant_id, p_credit_note_id, p_invoice_id, round(p_amount,2), auth.uid())
  RETURNING id INTO v_app_id;

  RETURN v_app_id;
END; $$;

-- ------------------------------------------------------------
-- Permissions + role seeding
-- ------------------------------------------------------------
INSERT INTO public.permissions (code, label, description) VALUES
  ('credit_notes.view',   'View credit notes',   'View credit notes and their line items'),
  ('credit_notes.create', 'Create credit notes', 'Create and edit draft credit notes'),
  ('credit_notes.issue',  'Issue credit notes',  'Issue (lock) a draft credit note'),
  ('credit_notes.apply',  'Apply credit notes',  'Apply an issued credit note against an invoice'),
  ('credit_notes.void',   'Void credit notes',   'Cancel a credit note (with no applications)')
ON CONFLICT (code) DO NOTHING;

-- Mirror invoice permission grants onto the credit-note equivalents.
-- view↔view, create↔create, issue↔send, apply↔mark_paid, void↔void
WITH map(cn_code, inv_code) AS (VALUES
  ('credit_notes.view',   'invoices.view'),
  ('credit_notes.create', 'invoices.create'),
  ('credit_notes.issue',  'invoices.send'),
  ('credit_notes.apply',  'invoices.mark_paid'),
  ('credit_notes.void',   'invoices.void')
),
targets AS (
  SELECT DISTINCT rp.role_id, cn_perm.id AS permission_id
  FROM map m
  JOIN public.permissions inv_perm ON inv_perm.code = m.inv_code
  JOIN public.permissions cn_perm  ON cn_perm.code  = m.cn_code
  JOIN public.role_permissions rp  ON rp.permission_id = inv_perm.id
)
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT role_id, permission_id FROM targets
ON CONFLICT DO NOTHING;
