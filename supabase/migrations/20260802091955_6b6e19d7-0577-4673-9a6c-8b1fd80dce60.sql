ALTER TABLE public.documents
  ADD COLUMN IF NOT EXISTS invoice_id uuid REFERENCES public.invoices(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS documents_invoice_idx ON public.documents (invoice_id);

ALTER TYPE public.notification_event_type ADD VALUE IF NOT EXISTS 'payment_proof_uploaded';

CREATE OR REPLACE FUNCTION public.issue_booking_invoice(p_booking_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_b public.bookings;
  v_inv uuid;
  v_other integer;
  v_new uuid;
  v_num text;
BEGIN
  SELECT * INTO v_b FROM public.bookings WHERE id = p_booking_id;
  IF v_b.id IS NULL THEN RAISE EXCEPTION 'booking_not_found'; END IF;

  v_inv := v_b.invoice_id;
  IF v_inv IS NULL THEN RETURN NULL; END IF;

  SELECT count(*) INTO v_other
  FROM public.invoice_items
  WHERE invoice_id = v_inv AND booking_id IS DISTINCT FROM p_booking_id;

  IF v_other > 0 THEN
    v_num := public.next_invoice_number(v_b.tenant_id);
    INSERT INTO public.invoices(tenant_id, customer_id, invoice_number, status, notes)
    VALUES (v_b.tenant_id, v_b.customer_id, v_num, 'draft',
            'Booking ' || COALESCE(v_b.booking_number, ''))
    RETURNING id INTO v_new;

    UPDATE public.invoice_items SET invoice_id = v_new
    WHERE invoice_id = v_inv AND booking_id = p_booking_id;

    UPDATE public.bookings SET invoice_id = v_new WHERE id = p_booking_id;
    v_inv := v_new;
  END IF;

  UPDATE public.invoices
     SET status = 'issued',
         issue_date = COALESCE(issue_date, CURRENT_DATE),
         due_date = CURRENT_DATE
   WHERE id = v_inv AND status = 'draft';

  RETURN v_inv;
END;
$function$;

REVOKE ALL ON FUNCTION public.issue_booking_invoice(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.issue_booking_invoice(uuid) TO service_role;