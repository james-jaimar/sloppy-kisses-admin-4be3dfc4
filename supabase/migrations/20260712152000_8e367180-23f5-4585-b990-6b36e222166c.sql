
CREATE TYPE public.customer_credit_entry_type AS ENUM (
  'overpayment','manual_adjustment','credit_note_unapplied','allocation','refund_out'
);

CREATE TABLE public.customer_credit_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  entry_date date NOT NULL DEFAULT (now()::date),
  entry_type public.customer_credit_entry_type NOT NULL,
  amount numeric(12,2) NOT NULL,
  currency text NOT NULL DEFAULT 'ZAR',
  source_payment_id uuid REFERENCES public.payments(id) ON DELETE SET NULL,
  source_invoice_id uuid REFERENCES public.invoices(id) ON DELETE SET NULL,
  source_credit_note_id uuid REFERENCES public.credit_notes(id) ON DELETE SET NULL,
  source_refund_id uuid REFERENCES public.payment_refunds(id) ON DELETE SET NULL,
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX customer_credit_ledger_tenant_customer_idx
  ON public.customer_credit_ledger(tenant_id, customer_id, entry_date);
CREATE INDEX customer_credit_ledger_invoice_idx
  ON public.customer_credit_ledger(source_invoice_id) WHERE source_invoice_id IS NOT NULL;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.customer_credit_ledger TO authenticated;
GRANT ALL ON public.customer_credit_ledger TO service_role;

ALTER TABLE public.customer_credit_ledger ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Platform can manage all customer credit"
  ON public.customer_credit_ledger FOR ALL TO authenticated
  USING (public.is_platform_owner()) WITH CHECK (public.is_platform_owner());

CREATE POLICY "Tenant users can view credit ledger"
  ON public.customer_credit_ledger FOR SELECT TO authenticated
  USING (public.user_has_permission(tenant_id, 'customer_credit.view'));

CREATE POLICY "Tenant users can insert credit adjustments"
  ON public.customer_credit_ledger FOR INSERT TO authenticated
  WITH CHECK (
    public.user_has_permission(tenant_id, 'customer_credit.adjust')
    OR public.user_has_permission(tenant_id, 'customer_credit.allocate')
  );

CREATE POLICY "Customers can view own credit"
  ON public.customer_credit_ledger FOR SELECT TO authenticated
  USING (customer_id = public.current_customer_id(tenant_id));

CREATE OR REPLACE VIEW public.customer_credit_balances AS
  SELECT tenant_id, customer_id,
         round(coalesce(sum(amount),0), 2) AS balance,
         max(entry_date) AS last_entry_date
  FROM public.customer_credit_ledger
  GROUP BY tenant_id, customer_id;

GRANT SELECT ON public.customer_credit_balances TO authenticated;

INSERT INTO public.permissions(code, label, description) VALUES
  ('customer_credit.view', 'View customer credit', 'View customer credit ledger and balances'),
  ('customer_credit.allocate', 'Allocate customer credit', 'Apply customer credit to invoices'),
  ('customer_credit.adjust', 'Adjust customer credit', 'Record manual credit adjustments')
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.role_permissions(role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r CROSS JOIN public.permissions p
WHERE r.code IN ('tenant_owner','tenant_admin','staff_accounts')
  AND p.code IN ('customer_credit.view','customer_credit.allocate','customer_credit.adjust')
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION public.allocate_customer_credit(
  p_customer_id uuid, p_invoice_id uuid, p_amount numeric, p_notes text DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_inv public.invoices;
  v_bal numeric(12,2);
  v_new_paid numeric(12,2);
  v_new_balance numeric(12,2);
  v_ledger_id uuid;
BEGIN
  IF p_amount <= 0 THEN RAISE EXCEPTION 'Allocation amount must be positive'; END IF;
  SELECT * INTO v_inv FROM public.invoices WHERE id = p_invoice_id FOR UPDATE;
  IF v_inv.id IS NULL THEN RAISE EXCEPTION 'Invoice not found'; END IF;
  IF v_inv.customer_id <> p_customer_id THEN RAISE EXCEPTION 'Invoice does not belong to this customer'; END IF;
  IF NOT public.user_has_permission(v_inv.tenant_id, 'customer_credit.allocate') AND NOT public.is_platform_owner() THEN
    RAISE EXCEPTION 'Missing permission customer_credit.allocate';
  END IF;
  IF v_inv.status IN ('draft','cancelled') THEN RAISE EXCEPTION 'Cannot allocate credit to a % invoice', v_inv.status; END IF;
  IF p_amount > v_inv.balance_due + 0.0001 THEN
    RAISE EXCEPTION 'Allocation % exceeds invoice balance %', p_amount, v_inv.balance_due;
  END IF;

  SELECT coalesce(balance,0) INTO v_bal FROM public.customer_credit_balances
    WHERE tenant_id = v_inv.tenant_id AND customer_id = p_customer_id;
  IF coalesce(v_bal,0) < p_amount - 0.0001 THEN
    RAISE EXCEPTION 'Customer credit balance % is less than allocation %', coalesce(v_bal,0), p_amount;
  END IF;

  INSERT INTO public.customer_credit_ledger(tenant_id, customer_id, entry_type, amount, source_invoice_id, notes, created_by)
  VALUES (v_inv.tenant_id, p_customer_id, 'allocation', -round(p_amount,2), v_inv.id, p_notes, auth.uid())
  RETURNING id INTO v_ledger_id;

  v_new_paid := round(v_inv.amount_paid + p_amount, 2);
  v_new_balance := round(v_inv.balance_due - p_amount, 2);
  UPDATE public.invoices
    SET amount_paid = v_new_paid, balance_due = v_new_balance,
        status = CASE WHEN v_new_balance <= 0.0001 THEN 'paid'::billing_status
                      WHEN v_new_paid > 0 THEN 'part_paid'::billing_status
                      ELSE v_inv.status END,
        updated_at = now()
    WHERE id = v_inv.id;

  PERFORM public.log_invoice_event(v_inv.tenant_id, v_inv.id, 'credit_allocated',
    jsonb_build_object('amount', p_amount, 'ledger_id', v_ledger_id, 'notes', p_notes));
  RETURN v_ledger_id;
END $$;

CREATE OR REPLACE FUNCTION public.park_customer_credit(
  p_customer_id uuid, p_amount numeric, p_source_payment_id uuid DEFAULT NULL,
  p_entry_date date DEFAULT NULL, p_notes text DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_tenant_id uuid; v_ledger_id uuid;
BEGIN
  IF p_amount <= 0 THEN RAISE EXCEPTION 'Amount must be positive'; END IF;
  SELECT tenant_id INTO v_tenant_id FROM public.customers WHERE id = p_customer_id;
  IF v_tenant_id IS NULL THEN RAISE EXCEPTION 'Customer not found'; END IF;
  IF NOT public.user_has_permission(v_tenant_id, 'customer_credit.adjust') AND NOT public.is_platform_owner() THEN
    RAISE EXCEPTION 'Missing permission customer_credit.adjust';
  END IF;
  INSERT INTO public.customer_credit_ledger(tenant_id, customer_id, entry_type, amount, source_payment_id, entry_date, notes, created_by)
  VALUES (v_tenant_id, p_customer_id,
    CASE WHEN p_source_payment_id IS NULL THEN 'manual_adjustment' ELSE 'overpayment' END,
    round(p_amount,2), p_source_payment_id, coalesce(p_entry_date, now()::date), p_notes, auth.uid())
  RETURNING id INTO v_ledger_id;
  RETURN v_ledger_id;
END $$;

CREATE OR REPLACE FUNCTION public.adjust_customer_credit(
  p_customer_id uuid, p_amount numeric, p_notes text
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_tenant_id uuid; v_ledger_id uuid;
BEGIN
  SELECT tenant_id INTO v_tenant_id FROM public.customers WHERE id = p_customer_id;
  IF v_tenant_id IS NULL THEN RAISE EXCEPTION 'Customer not found'; END IF;
  IF NOT public.user_has_permission(v_tenant_id, 'customer_credit.adjust') AND NOT public.is_platform_owner() THEN
    RAISE EXCEPTION 'Missing permission customer_credit.adjust';
  END IF;
  INSERT INTO public.customer_credit_ledger(tenant_id, customer_id, entry_type, amount, notes, created_by)
  VALUES (v_tenant_id, p_customer_id, 'manual_adjustment', round(p_amount,2), p_notes, auth.uid())
  RETURNING id INTO v_ledger_id;
  RETURN v_ledger_id;
END $$;

CREATE OR REPLACE VIEW public.customer_aging AS
  SELECT
    i.tenant_id, i.customer_id,
    c.full_name AS customer_name, c.customer_number, c.email AS customer_email,
    sum(CASE WHEN i.due_date >= current_date THEN i.balance_due ELSE 0 END) AS current_bucket,
    sum(CASE WHEN i.due_date <  current_date AND i.due_date >= current_date - 30 THEN i.balance_due ELSE 0 END) AS days_1_30,
    sum(CASE WHEN i.due_date <  current_date - 30 AND i.due_date >= current_date - 60 THEN i.balance_due ELSE 0 END) AS days_31_60,
    sum(CASE WHEN i.due_date <  current_date - 60 AND i.due_date >= current_date - 90 THEN i.balance_due ELSE 0 END) AS days_61_90,
    sum(CASE WHEN i.due_date <  current_date - 90 THEN i.balance_due ELSE 0 END) AS days_over_90,
    sum(i.balance_due) AS total_due,
    coalesce((SELECT balance FROM public.customer_credit_balances b
              WHERE b.tenant_id = i.tenant_id AND b.customer_id = i.customer_id), 0) AS credit_balance,
    sum(i.balance_due) - coalesce((SELECT balance FROM public.customer_credit_balances b
              WHERE b.tenant_id = i.tenant_id AND b.customer_id = i.customer_id), 0) AS net_due
  FROM public.invoices i
  JOIN public.customers c ON c.id = i.customer_id
  WHERE i.status IN ('sent','part_paid','overdue') AND i.balance_due > 0
  GROUP BY i.tenant_id, i.customer_id, c.full_name, c.customer_number, c.email;

GRANT SELECT ON public.customer_aging TO authenticated;
