-- Rollback-only regression: no bookings, payments, invoices or messages survive.
DO $$
DECLARE first_id uuid; second_id uuid; inv_id uuid; line_count integer;
BEGIN
  BEGIN
    SELECT b.id,b.invoice_id INTO first_id,inv_id FROM public.bookings b
    JOIN public.grooming_booking_details d ON d.booking_id=b.id
    JOIN public.invoices i ON i.id=b.invoice_id
    WHERE i.status::text='draft' AND b.parent_booking_id IS NULL
      AND b.service_type IN ('grooming_inhouse','grooming_mobile') LIMIT 1;
    SELECT b.id INTO second_id FROM public.bookings b
    JOIN public.grooming_booking_details d ON d.booking_id=b.id
    JOIN public.invoices i ON i.id=b.invoice_id
    WHERE i.status::text='draft' AND b.parent_booking_id IS NULL AND b.id<>first_id
      AND b.service_type IN ('grooming_inhouse','grooming_mobile') LIMIT 1;
    IF first_id IS NULL OR second_id IS NULL THEN RAISE EXCEPTION 'Need two draft grooming appointments for regression'; END IF;
    UPDATE public.grooming_booking_details SET matted_surcharge_zar=0 WHERE booking_id IN (first_id,second_id);
    UPDATE public.grooming_booking_details SET matted_surcharge_zar=200 WHERE booking_id=first_id;
    UPDATE public.grooming_booking_details SET matted_surcharge_zar=50 WHERE booking_id=second_id;
    IF (SELECT unit_price FROM public.invoice_items WHERE booking_id=first_id AND item_code='GROOM_MATTED') IS DISTINCT FROM 200::numeric THEN RAISE EXCEPTION 'Extra hour surcharge not R200'; END IF;
    IF (SELECT unit_price FROM public.invoice_items WHERE booking_id=second_id AND item_code='GROOM_MATTED') IS DISTINCT FROM 50::numeric THEN RAISE EXCEPTION 'Second dog surcharge not independent'; END IF;
    UPDATE public.grooming_booking_details SET matted_surcharge_zar=175 WHERE booking_id=first_id;
    SELECT count(*) INTO line_count FROM public.invoice_items WHERE booking_id=first_id AND item_code='GROOM_MATTED';
    IF line_count<>1 OR (SELECT unit_price FROM public.invoice_items WHERE booking_id=first_id AND item_code='GROOM_MATTED')<>175 THEN RAISE EXCEPTION 'Custom surcharge duplicated or incorrect'; END IF;
    UPDATE public.grooming_booking_details SET matted_surcharge_zar=0 WHERE booking_id=first_id;
    IF EXISTS(SELECT 1 FROM public.invoice_items WHERE booking_id=first_id AND item_code='GROOM_MATTED') THEN RAISE EXCEPTION 'Zero surcharge retained a charge'; END IF;
    UPDATE public.grooming_booking_details SET matted_surcharge_zar=200 WHERE booking_id=first_id;
    UPDATE public.invoices SET status='issued' WHERE id=inv_id;
    UPDATE public.grooming_booking_details SET matted_surcharge_zar=300 WHERE booking_id=first_id;
    IF (SELECT unit_price FROM public.invoice_items WHERE booking_id=first_id AND item_code='GROOM_MATTED') IS DISTINCT FROM 200::numeric THEN RAISE EXCEPTION 'Issued invoice changed'; END IF;
    RAISE EXCEPTION SQLSTATE 'ZX001' USING MESSAGE='rollback successful regression';
  EXCEPTION WHEN SQLSTATE 'ZX001' THEN NULL;
  END;
END;
$$;