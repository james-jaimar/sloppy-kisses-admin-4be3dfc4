-- Recompute an invoice's paid/balance/status from payments + allocations.
CREATE OR REPLACE FUNCTION public.recompute_invoice_payments(p_invoice_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_paid numeric(12,2);
BEGIN
  IF p_invoice_id IS NULL THEN RETURN; END IF;

  SELECT COALESCE((SELECT SUM(pa.amount) FROM public.payment_allocations pa WHERE pa.invoice_id = p_invoice_id), 0)
       + COALESCE((SELECT SUM(p.amount) FROM public.payments p
                   WHERE p.invoice_id = p_invoice_id
                     AND p.status NOT IN ('failed','cancelled','voided','refunded')
                     AND NOT EXISTS (SELECT 1 FROM public.payment_allocations pa2 WHERE pa2.payment_id = p.id)), 0)
    INTO v_paid;

  UPDATE public.invoices i SET
    amount_paid = v_paid,
    balance_due = GREATEST(i.total - v_paid, 0),
    status = CASE
      WHEN i.status IN ('draft','cancelled') THEN i.status
      WHEN v_paid >= i.total - 0.005 THEN 'paid'::billing_status
      WHEN v_paid > 0 THEN 'part_paid'::billing_status
      WHEN i.status IN ('paid','part_paid') THEN 'issued'::billing_status
      ELSE i.status
    END
  WHERE i.id = p_invoice_id;
END;
$$;

REVOKE ALL ON FUNCTION public.recompute_invoice_payments(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.recompute_invoice_payments(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.payments_recompute_invoice()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF TG_OP <> 'INSERT' AND OLD.invoice_id IS NOT NULL THEN
    PERFORM public.recompute_invoice_payments(OLD.invoice_id);
  END IF;
  IF TG_OP <> 'DELETE' AND NEW.invoice_id IS NOT NULL THEN
    PERFORM public.recompute_invoice_payments(NEW.invoice_id);
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_payments_recompute_invoice ON public.payments;
CREATE TRIGGER trg_payments_recompute_invoice
AFTER INSERT OR UPDATE OR DELETE ON public.payments
FOR EACH ROW EXECUTE FUNCTION public.payments_recompute_invoice();

DROP TRIGGER IF EXISTS trg_payment_allocations_recompute_invoice ON public.payment_allocations;
CREATE TRIGGER trg_payment_allocations_recompute_invoice
AFTER INSERT OR UPDATE OR DELETE ON public.payment_allocations
FOR EACH ROW EXECUTE FUNCTION public.payments_recompute_invoice();

-- allocate_payment previously only counted payments with status 'succeeded',
-- a value the app never writes; delegate to the shared recompute instead.
CREATE OR REPLACE FUNCTION public.allocate_payment(p_payment_id uuid, p_allocations jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
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

  PERFORM public.recompute_invoice_payments(id)
  FROM (
    SELECT invoice_id AS id FROM public.payment_allocations WHERE payment_id = p_payment_id
    UNION
    SELECT v_pay.invoice_id WHERE v_pay.invoice_id IS NOT NULL
  ) t;

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