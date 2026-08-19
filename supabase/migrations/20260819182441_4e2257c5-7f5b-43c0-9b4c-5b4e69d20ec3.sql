ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS invoice_review_needed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS invoice_review_reason text;

-- Single source of truth for hotel amendment fees
DROP TRIGGER IF EXISTS trg_hotel_amendment_fee ON public.bookings;

CREATE OR REPLACE FUNCTION public.hotel_details_auto_invoice()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_booking public.bookings;
  v_species text;
  v_pet_name text;
  v_pet_count integer := 1;
  v_nights integer;
  v_inv uuid; v_sort integer;
  r record;
  v_qty numeric(6,2);
  v_price numeric(12,2);
  v_start date; v_end date;
  v_old_total numeric(12,2);
  v_new_total numeric(12,2);
  v_status text;
  v_xero text;
  v_dates text;
BEGIN
  SELECT * INTO v_booking FROM public.bookings WHERE id = NEW.booking_id;
  IF v_booking.id IS NULL THEN RETURN NEW; END IF;
  IF NOT COALESCE(public._auto_invoice_enabled(NEW.tenant_id, 'hotel'), true) THEN RETURN NEW; END IF;

  v_start := COALESCE(v_booking.start_date, v_booking.start_at::date);
  v_end   := COALESCE(v_booking.end_date, v_booking.end_at::date);
  v_nights := GREATEST(1, COALESCE(v_end - v_start, 1));
  v_species := CASE WHEN v_booking.service_type::text = 'hotel_cat' THEN 'cat' ELSE 'dog' END;

  SELECT COUNT(*) INTO v_pet_count FROM public.booking_pets WHERE booking_id = v_booking.id;
  IF v_pet_count = 0 THEN v_pet_count := 1; END IF;

  -- Locked invoice: never silently leave a wrong invoice behind.
  IF v_booking.invoice_id IS NOT NULL AND public._invoice_locked(v_booking.invoice_id) THEN
    SELECT status::text, total INTO v_status, v_old_total
      FROM public.invoices WHERE id = v_booking.invoice_id;

    SELECT COALESCE(SUM(line_total), 0) INTO v_new_total
      FROM public.hotel_stay_lines(NEW.tenant_id, v_species, NEW.accommodation_type, v_start, v_end, v_pet_count);

    IF v_new_total IS DISTINCT FROM NULL THEN
      UPDATE public.bookings
         SET invoice_review_needed = true,
             invoice_review_reason =
               'Booking changed after invoice was ' || v_status ||
               '. Invoice needs a manual update or credit note (stay now '
               || to_char(v_start, 'DD Mon YYYY') || ' – ' || to_char(v_end, 'DD Mon YYYY') || ').'
       WHERE id = v_booking.id;

      INSERT INTO public.invoice_events(tenant_id, invoice_id, event_type, notes, payload)
      VALUES (v_booking.tenant_id, v_booking.invoice_id, 'reprice_blocked',
        'Hotel booking ' || COALESCE(v_booking.booking_number,'') || ' changed but the invoice is ' || v_status,
        jsonb_build_object('booking_id', v_booking.id, 'start_date', v_start, 'end_date', v_end));
    END IF;
    RETURN NEW;
  END IF;

  -- Only remove the auto-generated stay/surcharge lines. Fees (amendment,
  -- cancellation, extras) stay on the invoice.
  IF v_booking.invoice_id IS NOT NULL THEN
    DELETE FROM public.invoice_items
     WHERE booking_id = v_booking.id
       AND invoice_id = v_booking.invoice_id
       AND (source_type IS NULL OR source_type IN ('hotel_stay','hotel_surcharge'));
  END IF;

  SELECT p.name INTO v_pet_name
    FROM public.booking_pets bp JOIN public.pets p ON p.id = bp.pet_id
   WHERE bp.booking_id = v_booking.id
   ORDER BY p.name LIMIT 1;

  v_inv := public.ensure_booking_invoice(v_booking.id);
  IF v_inv IS NULL THEN RETURN NEW; END IF;

  SELECT total INTO v_old_total FROM public.invoices WHERE id = v_inv;
  SELECT COALESCE(MAX(sort_order),0)+1 INTO v_sort FROM public.invoice_items WHERE invoice_id = v_inv;

  v_dates := to_char(v_start, 'DD Mon YYYY') || ' – ' || to_char(v_end, 'DD Mon YYYY');

  FOR r IN
    SELECT * FROM public.hotel_stay_lines(
      NEW.tenant_id, v_species, NEW.accommodation_type, v_start, v_end, v_pet_count)
  LOOP
    INSERT INTO public.invoice_items(tenant_id, invoice_id, booking_id, description, quantity, unit_price, line_total, sort_order, source_type, source_id)
    VALUES (v_booking.tenant_id, v_inv, v_booking.id,
      CASE WHEN r.description LIKE 'Hotel stay —%' AND v_pet_name IS NOT NULL
           THEN replace(r.description, ' · ' || v_nights || ' night', ' (' || v_pet_name || ') · ' || v_nights || ' night')
           ELSE r.description END || ' · ' || v_dates,
      r.quantity, r.unit_price, r.line_total, v_sort, 'hotel_stay', v_booking.id);
    v_sort := v_sort + 1;
  END LOOP;

  FOR r IN
    SELECT bs.quantity, COALESCE(bs.price_override_zar, s.price_zar) AS unit_price, s.name, s.per_night
    FROM public.hotel_booking_surcharges bs
    JOIN public.hotel_surcharges s ON s.id = bs.surcharge_id
    WHERE bs.booking_id = v_booking.id
  LOOP
    v_qty := r.quantity * CASE WHEN r.per_night THEN v_nights ELSE 1 END;
    v_price := r.unit_price;
    INSERT INTO public.invoice_items(tenant_id, invoice_id, booking_id, description, quantity, unit_price, line_total, sort_order, source_type, source_id)
    VALUES (v_booking.tenant_id, v_inv, v_booking.id,
      r.name || CASE WHEN r.per_night THEN ' · ' || v_nights || ' night' || CASE WHEN v_nights = 1 THEN '' ELSE 's' END ELSE '' END,
      v_qty, v_price, ROUND(v_qty * v_price, 2), v_sort, 'hotel_surcharge', v_booking.id);
    v_sort := v_sort + 1;
  END LOOP;

  PERFORM public.sync_hotel_deposit_invoice(v_booking.id);
  PERFORM public.sync_hotel_daycare_credits(v_booking.id);

  -- Clear any stale review flag now that the invoice matches the booking.
  IF COALESCE(v_booking.invoice_review_needed, false) THEN
    UPDATE public.bookings
       SET invoice_review_needed = false, invoice_review_reason = NULL
     WHERE id = v_booking.id;
  END IF;

  SELECT total, xero_invoice_id INTO v_new_total, v_xero FROM public.invoices WHERE id = v_inv;

  IF TG_OP = 'UPDATE' AND v_new_total IS DISTINCT FROM v_old_total THEN
    INSERT INTO public.invoice_events(tenant_id, invoice_id, event_type, notes, payload)
    VALUES (v_booking.tenant_id, v_inv, 'repriced',
      'Repriced from booking ' || COALESCE(v_booking.booking_number,''),
      jsonb_build_object('old_total', v_old_total, 'new_total', v_new_total,
                         'start_date', v_start, 'end_date', v_end));
  END IF;

  -- Re-queue an already-synced invoice so accounting stays in step.
  IF v_xero IS NOT NULL AND v_new_total IS DISTINCT FROM v_old_total THEN
    INSERT INTO public.xero_sync_queue(tenant_id, entity_type, entity_id, status, run_after)
    VALUES (v_booking.tenant_id, 'invoice', v_inv, 'pending', now());
  END IF;

  RETURN NEW;
END;
$function$;

-- Reprice on any hotel-relevant detail change, not just accommodation type
DROP TRIGGER IF EXISTS trg_hotel_details_auto_invoice ON public.hotel_booking_details;
CREATE TRIGGER trg_hotel_details_auto_invoice
AFTER INSERT OR UPDATE OF accommodation_type ON public.hotel_booking_details
FOR EACH ROW EXECUTE FUNCTION public.hotel_details_auto_invoice();

-- Amendment fee: tagged, deduped, and flagged when the invoice is locked
CREATE OR REPLACE FUNCTION public.bookings_fees_on_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_free int;
  v_fee numeric(12,2);
  v_inv uuid;
  v_status text;
  v_count int;
  v_sort int;
BEGIN
  IF NEW.status = 'cancelled'::public.booking_status
     AND OLD.status IS DISTINCT FROM NEW.status THEN
    PERFORM public.apply_cancellation_fee(NEW.id, COALESCE(NEW.cancellation_fee_waived,false), NULL);
    RETURN NEW;
  END IF;

  IF (NEW.start_at IS DISTINCT FROM OLD.start_at OR NEW.end_at IS DISTINCT FROM OLD.end_at)
     AND OLD.status::text NOT IN ('draft','cancelled')
     AND NEW.service_type::text LIKE 'hotel%' THEN

    v_count := COALESCE(OLD.amendment_count, 0) + 1;
    UPDATE public.bookings SET amendment_count = v_count WHERE id = NEW.id;

    SELECT COALESCE(hotel_free_amendments,0), COALESCE(hotel_amendment_fee,0)
      INTO v_free, v_fee
    FROM public.policy_settings WHERE tenant_id = NEW.tenant_id;

    IF COALESCE(v_fee,0) > 0 AND v_count > COALESCE(v_free,0) THEN
      v_inv := NEW.invoice_id;
      IF v_inv IS NULL THEN
        SELECT DISTINCT ii.invoice_id INTO v_inv
        FROM public.invoice_items ii WHERE ii.booking_id = NEW.id LIMIT 1;
      END IF;

      IF v_inv IS NOT NULL THEN
        SELECT status::text INTO v_status FROM public.invoices WHERE id = v_inv;

        IF v_status IN ('sent','part_paid','paid','overdue','cancelled') THEN
          UPDATE public.bookings
             SET invoice_review_needed = true,
                 invoice_review_reason = COALESCE(invoice_review_reason || ' ', '')
                   || 'Amendment fee of R' || v_fee || ' not billed — invoice is ' || v_status || '.'
           WHERE id = NEW.id;
        ELSE
          SELECT COALESCE(MAX(sort_order),0)+1 INTO v_sort FROM public.invoice_items WHERE invoice_id = v_inv;
          INSERT INTO public.invoice_items(
            tenant_id, invoice_id, booking_id, description, quantity, unit_price, line_total,
            sort_order, source_type, source_id
          ) VALUES (
            NEW.tenant_id, v_inv, NEW.id,
            'Amendment fee — booking ' || COALESCE(NEW.booking_number,'') || ' (change ' || v_count || ')',
            1, v_fee, v_fee, v_sort, 'amendment_fee', NEW.id
          );
        END IF;
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;