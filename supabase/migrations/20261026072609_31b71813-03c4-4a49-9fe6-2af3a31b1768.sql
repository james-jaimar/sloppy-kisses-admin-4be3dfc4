CREATE OR REPLACE FUNCTION public.ensure_booking_invoice_before_hotel_review(p_booking_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_b public.bookings;
  v_id uuid;
  v_terms integer;
  v_num text;
  v_issue date;
  v_due date;
  v_service_key text;
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

  -- Hotel and cattery share one "Hotel & cattery" terms setting.
  v_service_key := CASE WHEN v_b.service_type::text = 'hotel_cat' THEN 'hotel_dog' ELSE v_b.service_type::text END;

  -- Per-service payment terms override the default for same-day/past bookings.
  SELECT COALESCE(
           NULLIF(service_terms ->> v_service_key, '')::integer,
           payment_terms_days,
           14)
  INTO v_terms
  FROM public.invoicing_settings WHERE tenant_id = v_b.tenant_id;
  v_terms := COALESCE(v_terms, 14);

  -- Bookings made in advance are dated and payable on the service date, so a
  -- batch of repeat appointments doesn't produce a stack of invoices all
  -- dated the day they were captured. Same-day/past bookings keep the
  -- (possibly per-service) payment terms.
  IF v_b.start_at IS NOT NULL AND v_b.start_at::date > CURRENT_DATE THEN
    v_issue := v_b.start_at::date;
    v_due := v_b.start_at::date;
  ELSE
    v_issue := CURRENT_DATE;
    v_due := CURRENT_DATE + v_terms;
  END IF;

  v_num := public.next_invoice_number(v_b.tenant_id);

  INSERT INTO public.invoices(
    tenant_id, customer_id, invoice_number, status, notes, issue_date, due_date
  ) VALUES (
    v_b.tenant_id, v_b.customer_id, v_num, 'issued',
    'Booking ' || COALESCE(v_b.booking_number, ''),
    v_issue, v_due
  ) RETURNING id INTO v_id;

  UPDATE public.bookings SET invoice_id = v_id WHERE id = p_booking_id;
  RETURN v_id;
END;
$function$;