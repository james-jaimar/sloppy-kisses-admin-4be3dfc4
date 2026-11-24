ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS replaces_invoice_id uuid REFERENCES public.invoices(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS rebill_credit_note_id uuid REFERENCES public.credit_notes(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS rebill_reason text;

CREATE OR REPLACE FUNCTION public.rebill_invoice(p_invoice_id uuid, p_reason text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_inv public.invoices;
  v_cn_id uuid;
  v_cn_total numeric(12,2);
  v_apply numeric(12,2);
  v_carry numeric(12,2);
  v_new_id uuid;
  v_new_number text;
  v_cn_number text;
BEGIN
  IF coalesce(trim(p_reason),'') = '' THEN RAISE EXCEPTION 'Please give a reason for the adjustment'; END IF;
  SELECT * INTO v_inv FROM public.invoices WHERE id = p_invoice_id FOR UPDATE;
  IF v_inv.id IS NULL THEN RAISE EXCEPTION 'Invoice not found'; END IF;
  IF NOT (public.user_has_permission(v_inv.tenant_id,'invoices.create') AND public.user_has_permission(v_inv.tenant_id,'credit_notes.create')) THEN
    RAISE EXCEPTION 'You do not have permission to adjust invoices';
  END IF;
  IF v_inv.status IN ('draft','cancelled') THEN RAISE EXCEPTION 'Only issued invoices can be adjusted'; END IF;
  IF EXISTS (SELECT 1 FROM public.invoices WHERE replaces_invoice_id = v_inv.id AND status <> 'cancelled') THEN
    RAISE EXCEPTION 'This invoice has already been adjusted';
  END IF;
  IF EXISTS (SELECT 1 FROM public.credit_notes WHERE invoice_id = v_inv.id AND status IN ('issued','applied')) THEN
    RAISE EXCEPTION 'This invoice already has a credit note. Please adjust it manually.';
  END IF;
  IF v_inv.total <= 0 THEN RAISE EXCEPTION 'Nothing to credit on this invoice'; END IF;

  -- 1. Full VAT-inclusive credit note
  v_cn_number := public.next_credit_note_number(v_inv.tenant_id);
  INSERT INTO public.credit_notes(tenant_id, credit_note_number, customer_id, invoice_id, status, reason, notes)
  VALUES (v_inv.tenant_id, v_cn_number, v_inv.customer_id, v_inv.id, 'draft', p_reason, 'Adjust & re-bill of ' || v_inv.invoice_number)
  RETURNING id INTO v_cn_id;

  INSERT INTO public.credit_note_items(tenant_id, credit_note_id, description, quantity, unit_price, sort_order, item_code)
  SELECT v_inv.tenant_id, v_cn_id, ii.description, 1, round(ii.line_total + coalesce(ii.vat_amount,0), 2), ii.sort_order, ii.item_code
  FROM public.invoice_items ii WHERE ii.invoice_id = v_inv.id;

  SELECT total INTO v_cn_total FROM public.credit_notes WHERE id = v_cn_id;
  -- Rounding guard: match the invoice total exactly
  IF abs(v_cn_total - v_inv.total) > 0.0001 THEN
    UPDATE public.credit_note_items SET unit_price = unit_price + (v_inv.total - v_cn_total)
    WHERE id = (SELECT id FROM public.credit_note_items WHERE credit_note_id = v_cn_id ORDER BY sort_order DESC, created_at DESC LIMIT 1);
    v_cn_total := v_inv.total;
  END IF;

  UPDATE public.credit_notes SET status = 'issued', issue_date = current_date WHERE id = v_cn_id;

  -- 2. Settle whatever is still owing on the original
  v_apply := least(v_inv.balance_due, v_cn_total);
  IF v_apply > 0 THEN
    INSERT INTO public.credit_note_applications(tenant_id, credit_note_id, invoice_id, amount, applied_by)
    VALUES (v_inv.tenant_id, v_cn_id, v_inv.id, v_apply, auth.uid());
  END IF;

  -- 3. Money already received becomes customer credit
  v_carry := round(v_cn_total - v_apply, 2);
  IF v_carry > 0 THEN
    INSERT INTO public.customer_credit_ledger(tenant_id, customer_id, entry_type, amount, source_invoice_id, source_credit_note_id, notes, created_by)
    VALUES (v_inv.tenant_id, v_inv.customer_id, 'credit_note_unapplied', v_carry, v_inv.id, v_cn_id,
            'Held from ' || v_inv.invoice_number || ' for re-bill', auth.uid());
    UPDATE public.credit_notes SET amount_applied = total, balance = 0, status = 'applied' WHERE id = v_cn_id;
  END IF;

  -- 4. Editable replacement draft
  v_new_number := public.next_invoice_number(v_inv.tenant_id);
  INSERT INTO public.invoices(tenant_id, customer_id, invoice_number, status, notes, booking_id, invoice_kind,
    billing_period_start, billing_period_end, replaces_invoice_id, rebill_credit_note_id, rebill_reason)
  VALUES (v_inv.tenant_id, v_inv.customer_id, v_new_number, 'draft', v_inv.notes, v_inv.booking_id, v_inv.invoice_kind,
    v_inv.billing_period_start, v_inv.billing_period_end, v_inv.id, v_cn_id, p_reason)
  RETURNING id INTO v_new_id;

  INSERT INTO public.invoice_items(tenant_id, invoice_id, booking_id, product_id, description, quantity, unit_price, sort_order,
    source_type, source_id, xero_account_code, vat_rate, discount_pct, vat_inclusive, item_code)
  SELECT tenant_id, v_new_id, booking_id, product_id, description, quantity, unit_price, sort_order,
    CASE WHEN source_type = 'daycare_enrolment_prorata' THEN NULL ELSE source_type END,
    CASE WHEN source_type = 'daycare_enrolment_prorata' THEN NULL ELSE source_id END,
    xero_account_code, vat_rate, discount_pct, vat_inclusive, item_code
  FROM public.invoice_items WHERE invoice_id = v_inv.id ORDER BY sort_order;

  UPDATE public.bookings SET invoice_id = v_new_id WHERE invoice_id = v_inv.id AND tenant_id = v_inv.tenant_id;

  PERFORM public.log_invoice_event(v_inv.tenant_id, v_inv.id, 'rebilled',
    jsonb_build_object('reason', p_reason, 'credit_note_number', v_cn_number, 'new_invoice_id', v_new_id, 'new_invoice_number', v_new_number, 'held_credit', v_carry));
  PERFORM public.log_invoice_event(v_inv.tenant_id, v_new_id, 'rebill_created',
    jsonb_build_object('reason', p_reason, 'replaces_invoice_number', v_inv.invoice_number, 'held_credit', v_carry));
  RETURN v_new_id;
END $$;

REVOKE ALL ON FUNCTION public.rebill_invoice(uuid, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.rebill_invoice(uuid, text) TO authenticated;

-- When the replacement is issued, settle it from the credit held for it
CREATE OR REPLACE FUNCTION public.invoices_apply_rebill_credit()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_held numeric(12,2);
  v_bal numeric(12,2);
  v_amt numeric(12,2);
  v_paid numeric(12,2);
  v_due numeric(12,2);
BEGIN
  IF NEW.rebill_credit_note_id IS NULL OR OLD.status <> 'draft' OR NEW.status IN ('draft','cancelled') THEN RETURN NEW; END IF;
  SELECT coalesce(sum(amount),0) INTO v_held FROM public.customer_credit_ledger
    WHERE tenant_id = NEW.tenant_id AND customer_id = NEW.customer_id
      AND (source_credit_note_id = NEW.rebill_credit_note_id);
  SELECT coalesce(balance,0) INTO v_bal FROM public.customer_credit_balances
    WHERE tenant_id = NEW.tenant_id AND customer_id = NEW.customer_id;
  SELECT amount_paid, balance_due INTO v_paid, v_due FROM public.invoices WHERE id = NEW.id;
  v_amt := round(least(v_held, coalesce(v_bal,0), v_due), 2);
  IF v_amt <= 0 THEN RETURN NEW; END IF;
  INSERT INTO public.customer_credit_ledger(tenant_id, customer_id, entry_type, amount, source_invoice_id, source_credit_note_id, notes, created_by)
  VALUES (NEW.tenant_id, NEW.customer_id, 'allocation', -v_amt, NEW.id, NEW.rebill_credit_note_id, 'Re-bill credit applied', auth.uid());
  UPDATE public.invoices SET amount_paid = round(v_paid + v_amt,2), balance_due = round(v_due - v_amt,2),
    status = CASE WHEN v_due - v_amt <= 0.0001 THEN 'paid'::billing_status ELSE 'part_paid'::billing_status END
  WHERE id = NEW.id;
  PERFORM public.log_invoice_event(NEW.tenant_id, NEW.id, 'credit_allocated', jsonb_build_object('amount', v_amt, 'notes', 'Re-bill credit applied'));
  RETURN NEW;
END $$;

REVOKE ALL ON FUNCTION public.invoices_apply_rebill_credit() FROM public, anon, authenticated;

DROP TRIGGER IF EXISTS invoices_apply_rebill_credit_trg ON public.invoices;
CREATE TRIGGER invoices_apply_rebill_credit_trg AFTER UPDATE OF status ON public.invoices
FOR EACH ROW EXECUTE FUNCTION public.invoices_apply_rebill_credit();