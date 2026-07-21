
CREATE TABLE IF NOT EXISTS public.payment_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  payment_id uuid NOT NULL REFERENCES public.payments(id) ON DELETE CASCADE,
  invoice_id uuid NOT NULL REFERENCES public.invoices(id) ON DELETE RESTRICT,
  amount numeric(12,2) NOT NULL CHECK (amount > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid
);

CREATE INDEX IF NOT EXISTS payment_allocations_payment_idx ON public.payment_allocations(payment_id);
CREATE INDEX IF NOT EXISTS payment_allocations_invoice_idx ON public.payment_allocations(invoice_id);
CREATE INDEX IF NOT EXISTS payment_allocations_tenant_idx  ON public.payment_allocations(tenant_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.payment_allocations TO authenticated;
GRANT ALL ON public.payment_allocations TO service_role;

ALTER TABLE public.payment_allocations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "allocations_staff_select" ON public.payment_allocations FOR SELECT TO authenticated
  USING (public.user_has_tenant_access(tenant_id) AND public.user_has_permission(tenant_id, 'payments.view'));
CREATE POLICY "allocations_staff_insert" ON public.payment_allocations FOR INSERT TO authenticated
  WITH CHECK (public.user_has_tenant_access(tenant_id) AND public.user_has_permission(tenant_id, 'payments.create'));
CREATE POLICY "allocations_staff_update" ON public.payment_allocations FOR UPDATE TO authenticated
  USING (public.user_has_tenant_access(tenant_id) AND public.user_has_permission(tenant_id, 'payments.create'));
CREATE POLICY "allocations_staff_delete" ON public.payment_allocations FOR DELETE TO authenticated
  USING (public.user_has_tenant_access(tenant_id) AND public.user_has_permission(tenant_id, 'payments.create'));

ALTER TABLE public.products      ADD COLUMN IF NOT EXISTS xero_account_code text;
ALTER TABLE public.invoice_items ADD COLUMN IF NOT EXISTS xero_account_code text;

CREATE OR REPLACE FUNCTION public.allocate_payment(
  p_payment_id uuid,
  p_allocations jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pay        public.payments%ROWTYPE;
  v_alloc      jsonb;
  v_inv_id     uuid;
  v_amount     numeric(12,2);
  v_sum        numeric(12,2) := 0;
  v_remainder  numeric(12,2);
BEGIN
  SELECT * INTO v_pay FROM public.payments WHERE id = p_payment_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Payment % not found', p_payment_id; END IF;

  IF NOT public.user_has_tenant_access(v_pay.tenant_id) THEN
    RAISE EXCEPTION 'Not authorised for this tenant';
  END IF;

  DELETE FROM public.payment_allocations WHERE payment_id = p_payment_id;

  FOR v_alloc IN SELECT * FROM jsonb_array_elements(COALESCE(p_allocations, '[]'::jsonb))
  LOOP
    v_inv_id := (v_alloc->>'invoice_id')::uuid;
    v_amount := ROUND((v_alloc->>'amount')::numeric, 2);
    IF v_amount IS NULL OR v_amount <= 0 THEN CONTINUE; END IF;

    PERFORM 1 FROM public.invoices
      WHERE id = v_inv_id AND tenant_id = v_pay.tenant_id AND customer_id = v_pay.customer_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Invoice % not found for this customer', v_inv_id; END IF;

    INSERT INTO public.payment_allocations(tenant_id, payment_id, invoice_id, amount, created_by)
    VALUES (v_pay.tenant_id, p_payment_id, v_inv_id, v_amount, auth.uid());

    v_sum := v_sum + v_amount;
  END LOOP;

  IF v_sum > v_pay.amount + 0.005 THEN
    RAISE EXCEPTION 'Allocations (%) exceed payment amount (%)', v_sum, v_pay.amount;
  END IF;

  UPDATE public.invoices i SET
    amount_paid = COALESCE((SELECT SUM(pa.amount) FROM public.payment_allocations pa WHERE pa.invoice_id = i.id), 0)
      + COALESCE((SELECT SUM(p.amount) FROM public.payments p
                  WHERE p.invoice_id = i.id AND p.status = 'succeeded'
                    AND NOT EXISTS (SELECT 1 FROM public.payment_allocations pa2 WHERE pa2.payment_id = p.id)), 0),
    balance_due = GREATEST(total - (
      COALESCE((SELECT SUM(pa.amount) FROM public.payment_allocations pa WHERE pa.invoice_id = i.id), 0)
      + COALESCE((SELECT SUM(p.amount) FROM public.payments p
                  WHERE p.invoice_id = i.id AND p.status = 'succeeded'
                    AND NOT EXISTS (SELECT 1 FROM public.payment_allocations pa2 WHERE pa2.payment_id = p.id)), 0)
    ), 0)
  WHERE i.tenant_id = v_pay.tenant_id
    AND i.id IN (
      SELECT invoice_id FROM public.payment_allocations WHERE payment_id = p_payment_id
      UNION SELECT v_pay.invoice_id WHERE v_pay.invoice_id IS NOT NULL
    );

  UPDATE public.invoices SET
    status = CASE
      WHEN status IN ('void','draft') THEN status
      WHEN amount_paid >= total - 0.005 THEN 'paid'::billing_status
      WHEN amount_paid > 0 THEN 'partial'::billing_status
      ELSE status
    END
  WHERE tenant_id = v_pay.tenant_id
    AND id IN (
      SELECT invoice_id FROM public.payment_allocations WHERE payment_id = p_payment_id
      UNION SELECT v_pay.invoice_id WHERE v_pay.invoice_id IS NOT NULL
    );

  v_remainder := v_pay.amount - v_sum;
  IF v_remainder > 0.005 THEN
    INSERT INTO public.customer_credit_ledger(
      tenant_id, customer_id, entry_type, amount, source_type, source_id, notes, created_by
    ) VALUES (
      v_pay.tenant_id, v_pay.customer_id, 'credit', v_remainder,
      'payment', p_payment_id, 'Unallocated remainder from payment', auth.uid()
    );
  END IF;

  RETURN jsonb_build_object('allocated', v_sum, 'remainder_to_credit', GREATEST(v_remainder, 0));
END;
$$;

REVOKE ALL ON FUNCTION public.allocate_payment(uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.allocate_payment(uuid, jsonb) TO authenticated;
