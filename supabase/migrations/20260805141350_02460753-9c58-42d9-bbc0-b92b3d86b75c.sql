CREATE OR REPLACE FUNCTION public.hotel_details_auto_invoice()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_booking public.bookings;
  v_species text;
  v_pet_name text;
  v_pet_count integer := 1;
  v_nights integer;
  v_inv uuid; v_sort integer;
  v_rate public.hotel_rate_cards;
  v_uplift numeric(6,2) := 0;
  v_peak_start text; v_peak_end text;
  v_nightly numeric(12,2);
  v_line_total numeric(12,2);
  v_pets_over_first integer;
  r record;
  v_qty numeric(6,2);
  v_price numeric(12,2);
BEGIN
  SELECT * INTO v_booking FROM public.bookings WHERE id = NEW.booking_id;
  IF v_booking.id IS NULL THEN RETURN NEW; END IF;
  IF NOT COALESCE(public._auto_invoice_enabled(NEW.tenant_id, 'hotel'), true) THEN RETURN NEW; END IF;
  IF v_booking.invoice_id IS NOT NULL AND public._invoice_locked(v_booking.invoice_id) THEN RETURN NEW; END IF;

  IF v_booking.invoice_id IS NOT NULL THEN
    DELETE FROM public.invoice_items
     WHERE booking_id = v_booking.id
       AND invoice_id = v_booking.invoice_id;
  END IF;

  v_nights := GREATEST(1, COALESCE(
    (v_booking.end_date - v_booking.start_date),
    (EXTRACT(EPOCH FROM (v_booking.end_at - v_booking.start_at))/86400)::int,
    1));

  v_species := CASE WHEN v_booking.service_type::text = 'hotel_cat' THEN 'cat' ELSE 'dog' END;

  SELECT * INTO v_rate FROM public.hotel_rate_cards
   WHERE tenant_id = NEW.tenant_id
     AND species = v_species
     AND accommodation_type = COALESCE(NEW.accommodation_type, '')
     AND active = true
   LIMIT 1;

  -- Never invoice a stay at zero: an unmatched rate card is a configuration error.
  IF v_rate.id IS NULL THEN
    RAISE EXCEPTION 'No active hotel rate configured for % accommodation "%". Choose an accommodation type with a rate card.',
      v_species, COALESCE(NULLIF(NEW.accommodation_type, ''), '(none selected)');
  END IF;
  IF COALESCE(v_rate.nightly_rate_zar, 0) <= 0 THEN
    RAISE EXCEPTION 'Hotel rate "%" has no nightly price set.', v_rate.display_name;
  END IF;

  v_nightly := v_rate.nightly_rate_zar;

  SELECT peak_start_month_day, peak_end_month_day
    INTO v_peak_start, v_peak_end
  FROM public.hotel_workflow_settings WHERE tenant_id = NEW.tenant_id LIMIT 1;

  IF v_peak_start IS NOT NULL AND v_peak_end IS NOT NULL AND COALESCE(v_rate.peak_uplift_pct,0) > 0 THEN
    IF EXISTS (
      SELECT 1 FROM generate_series(
        COALESCE(v_booking.start_date, v_booking.start_at::date),
        COALESCE(v_booking.end_date, v_booking.end_at::date) - 1,
        '1 day') d
      WHERE to_char(d, 'MM-DD') BETWEEN v_peak_start AND v_peak_end
    ) THEN
      v_uplift := v_rate.peak_uplift_pct;
    END IF;
  END IF;

  IF v_uplift > 0 THEN
    v_nightly := ROUND(v_nightly * (1 + v_uplift/100), 2);
  END IF;

  SELECT COUNT(*) INTO v_pet_count FROM public.booking_pets WHERE booking_id = v_booking.id;
  IF v_pet_count = 0 THEN v_pet_count := 1; END IF;

  SELECT p.name INTO v_pet_name
    FROM public.booking_pets bp JOIN public.pets p ON p.id = bp.pet_id
   WHERE bp.booking_id = v_booking.id
   ORDER BY p.name LIMIT 1;

  v_inv := public.ensure_booking_invoice(v_booking.id);
  IF v_inv IS NULL THEN RETURN NEW; END IF;

  SELECT COALESCE(MAX(sort_order),0)+1 INTO v_sort FROM public.invoice_items WHERE invoice_id = v_inv;

  v_line_total := ROUND(v_nightly * v_nights, 2);
  INSERT INTO public.invoice_items(tenant_id, invoice_id, booking_id, description, quantity, unit_price, line_total, sort_order)
  VALUES (v_booking.tenant_id, v_inv, v_booking.id,
    'Hotel stay — ' || COALESCE(v_rate.display_name, NEW.accommodation_type, 'boarding')
      || CASE WHEN v_pet_name IS NOT NULL THEN ' (' || v_pet_name || ')' ELSE '' END
      || ' · ' || v_nights || ' night' || CASE WHEN v_nights = 1 THEN '' ELSE 's' END
      || CASE WHEN v_uplift > 0 THEN ' · peak +' || v_uplift || '%' ELSE '' END,
    v_nights, v_nightly, v_line_total, v_sort);
  v_sort := v_sort + 1;

  v_pets_over_first := GREATEST(0, v_pet_count - 1);
  IF v_pets_over_first > 0 AND COALESCE(v_rate.extra_pet_rate_zar, 0) > 0 THEN
    INSERT INTO public.invoice_items(tenant_id, invoice_id, booking_id, description, quantity, unit_price, line_total, sort_order)
    VALUES (v_booking.tenant_id, v_inv, v_booking.id,
      'Extra pet in same room · ' || v_nights || ' night' || CASE WHEN v_nights = 1 THEN '' ELSE 's' END,
      v_pets_over_first * v_nights,
      v_rate.extra_pet_rate_zar,
      ROUND(v_rate.extra_pet_rate_zar * v_pets_over_first * v_nights, 2),
      v_sort);
    v_sort := v_sort + 1;
  END IF;

  FOR r IN
    SELECT bs.quantity, COALESCE(bs.price_override_zar, s.price_zar) AS unit_price, s.name, s.per_night
    FROM public.hotel_booking_surcharges bs
    JOIN public.hotel_surcharges s ON s.id = bs.surcharge_id
    WHERE bs.booking_id = v_booking.id
  LOOP
    v_qty := r.quantity * CASE WHEN r.per_night THEN v_nights ELSE 1 END;
    v_price := r.unit_price;
    INSERT INTO public.invoice_items(tenant_id, invoice_id, booking_id, description, quantity, unit_price, line_total, sort_order)
    VALUES (v_booking.tenant_id, v_inv, v_booking.id,
      r.name || CASE WHEN r.per_night THEN ' · ' || v_nights || ' night' || CASE WHEN v_nights = 1 THEN '' ELSE 's' END ELSE '' END,
      v_qty, v_price, ROUND(v_qty * v_price, 2), v_sort);
    v_sort := v_sort + 1;
  END LOOP;

  PERFORM public.sync_hotel_deposit_invoice(v_booking.id);
  PERFORM public.sync_hotel_daycare_credits(v_booking.id);

  RETURN NEW;
END;
$fn$;