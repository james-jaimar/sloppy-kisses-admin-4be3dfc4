CREATE OR REPLACE FUNCTION public.ensure_booking_invoice(p_booking_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_b public.bookings;
  v_id uuid;
  v_terms integer;
  v_num text;
BEGIN
  SELECT * INTO v_b FROM public.bookings WHERE id = p_booking_id;
  IF v_b.id IS NULL THEN RETURN NULL; END IF;
  IF v_b.invoice_id IS NOT NULL THEN RETURN v_b.invoice_id; END IF;

  -- Multi-pet groups share a single invoice for the owner.
  IF v_b.booking_group_id IS NOT NULL THEN
    SELECT s.invoice_id INTO v_id
    FROM public.bookings s
    JOIN public.invoices i ON i.id = s.invoice_id
    WHERE s.booking_group_id = v_b.booking_group_id
      AND s.tenant_id = v_b.tenant_id
      AND s.customer_id = v_b.customer_id
      AND s.invoice_id IS NOT NULL
      AND i.status::text NOT IN ('cancelled', 'paid')
    ORDER BY s.created_at
    LIMIT 1;

    IF v_id IS NOT NULL THEN
      UPDATE public.bookings SET invoice_id = v_id WHERE id = p_booking_id;
      RETURN v_id;
    END IF;
  END IF;

  SELECT COALESCE(payment_terms_days, 14) INTO v_terms
  FROM public.invoicing_settings WHERE tenant_id = v_b.tenant_id;
  v_terms := COALESCE(v_terms, 14);

  v_num := public.next_invoice_number(v_b.tenant_id);

  INSERT INTO public.invoices(
    tenant_id, customer_id, invoice_number, status, notes, issue_date, due_date
  ) VALUES (
    v_b.tenant_id, v_b.customer_id, v_num, 'issued',
    'Booking ' || COALESCE(v_b.booking_number, ''),
    CURRENT_DATE, CURRENT_DATE + v_terms
  ) RETURNING id INTO v_id;

  UPDATE public.bookings SET invoice_id = v_id WHERE id = p_booking_id;
  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_booking_invoice(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ensure_booking_invoice(uuid) TO authenticated, service_role;