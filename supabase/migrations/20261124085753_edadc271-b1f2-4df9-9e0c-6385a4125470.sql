LOCK TABLE public.credit_notes, public.credit_note_items, public.credit_note_applications, public.invoices, public.xero_sync_queue IN SHARE ROW EXCLUSIVE MODE;
DO $repair$
DECLARE cn public.credit_notes; inv public.invoices; b public.bookings; original_items integer;
BEGIN
 SELECT * INTO inv FROM public.invoices WHERE id='ca7428f4-ac24-418d-ab01-9806e88aea4a' AND invoice_number='INV-70007' FOR UPDATE;
 SELECT * INTO cn FROM public.credit_notes WHERE id='b33128a0-7ec4-4a28-9837-6240ce739955' AND credit_note_number='CN-00052' FOR UPDATE;
 SELECT * INTO b FROM public.bookings WHERE id='347ed7b4-7080-4365-ab2e-13a32b2f0f58' FOR UPDATE;
 IF inv.id IS NULL OR cn.id IS NULL OR b.id IS NULL THEN RAISE EXCEPTION 'Test cancellation records not found'; END IF;
 IF cn.invoice_id<>inv.id OR cn.tenant_id<>inv.tenant_id OR b.tenant_id<>inv.tenant_id OR b.status<>'cancelled' OR NOT b.cancellation_fee_waived THEN RAISE EXCEPTION 'Unexpected cancellation relationship'; END IF;
 IF inv.total<>545 OR inv.tax_total<>71.09 OR inv.subtotal<>473.91 OR inv.amount_paid<>0 OR inv.balance_due<>71.09 OR cn.total<>473.91 OR cn.amount_applied<>473.91 OR cn.balance<>0 THEN RAISE EXCEPTION 'Financial state changed; correction requires review'; END IF;
 IF cn.xero_credit_note_id IS NOT NULL OR EXISTS(SELECT 1 FROM public.xero_sync_queue WHERE entity_id=cn.id AND status NOT IN ('pending','failed')) THEN RAISE EXCEPTION 'Credit note may be syncing or already synced; correction stopped'; END IF;
 SELECT count(*) INTO original_items FROM public.credit_note_items WHERE credit_note_id=cn.id;
 IF original_items<>1 OR NOT EXISTS(SELECT 1 FROM public.credit_note_items WHERE credit_note_id=cn.id AND item_code='booking_cancel:'||b.id||':'||inv.id AND quantity=1 AND unit_price=473.91 AND line_total=473.91) THEN RAISE EXCEPTION 'Unexpected credit note line'; END IF;
 -- One-off repair of an unsynced erroneous document. Table locks isolate this brief bypass;
 -- all permanent document locks are restored before applying the additional credit.
 ALTER TABLE public.credit_note_items DISABLE TRIGGER trg_cn_items_lock;
 ALTER TABLE public.credit_notes DISABLE TRIGGER trg_credit_notes_lock_and_log;
 UPDATE public.credit_note_items SET unit_price=545 WHERE credit_note_id=cn.id;
 ALTER TABLE public.credit_note_items ENABLE TRIGGER trg_cn_items_lock;
 ALTER TABLE public.credit_notes ENABLE TRIGGER trg_credit_notes_lock_and_log;
 UPDATE public.credit_notes SET notes=COALESCE(notes,'')||' VAT correction on 24 Nov 2026: credit increased from R473.91 to R545.00 including R71.09 VAT.' WHERE id=cn.id;
 INSERT INTO public.credit_note_applications(tenant_id,credit_note_id,invoice_id,amount) VALUES(cn.tenant_id,cn.id,inv.id,71.09);
 UPDATE public.bookings SET cancellation_fee_note='Credit note CN-00052 issued for R545.00 (VAT included); cancellation fee waived.' WHERE id=b.id;
 PERFORM public.log_invoice_event(inv.tenant_id,inv.id,'cancellation_vat_corrected',jsonb_build_object('credit_note_id',cn.id,'credit_note_number',cn.credit_note_number,'previous_credit_total',473.91,'corrected_credit_total',545.00,'additional_credit_applied',71.09,'reason','Cancellation credit omitted invoice VAT; unsynced test credit corrected with original application retained'));
 IF NOT EXISTS(SELECT 1 FROM public.credit_notes WHERE id=cn.id AND total=545 AND amount_applied=545 AND balance=0 AND status='applied') OR NOT EXISTS(SELECT 1 FROM public.invoices WHERE id=inv.id AND subtotal=473.91 AND tax_total=71.09 AND total=545 AND balance_due=0 AND amount_paid=0) THEN RAISE EXCEPTION 'Correction reconciliation failed'; END IF;
END;
$repair$;