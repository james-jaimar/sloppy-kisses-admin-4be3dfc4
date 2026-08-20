-- 1. Per-pet accommodation on a stay ---------------------------------
ALTER TABLE public.booking_pets
  ADD COLUMN IF NOT EXISTS accommodation_type text,
  ADD COLUMN IF NOT EXISTS rate_card_id uuid REFERENCES public.hotel_rate_cards(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS resource_id uuid REFERENCES public.resources(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 0;

-- 2. Preferred groomer on the customer --------------------------------
ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS preferred_groomer_resource_id uuid REFERENCES public.resources(id) ON DELETE SET NULL;

-- 3. Per-pet hotel stay pricing ---------------------------------------
-- p_pets: [{"name":"Doggy","accommodation_type":"standard"}, ...]
CREATE OR REPLACE FUNCTION public.hotel_stay_lines_pets(
  p_tenant_id uuid,
  p_species text,
  p_start date,
  p_end date,
  p_pets jsonb
)
RETURNS TABLE(description text, quantity numeric, unit_price numeric, line_total numeric)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_nights integer;
  v_peak_start text; v_peak_end text;
  v_peak boolean := false;
  g record;
  v_rate public.hotel_rate_cards;
  v_nightly numeric(12,2);
  v_uplift numeric(6,2);
  v_extra integer;
  v_dates text;
BEGIN
  v_nights := GREATEST(1, COALESCE(p_end - p_start, 1));
  v_dates := to_char(p_start, 'DD Mon YYYY') || ' – ' || to_char(p_end, 'DD Mon YYYY');

  SELECT peak_start_month_day, peak_end_month_day
    INTO v_peak_start, v_peak_end
    FROM public.hotel_workflow_settings WHERE tenant_id = p_tenant_id LIMIT 1;

  IF v_peak_start IS NOT NULL AND v_peak_end IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1 FROM generate_series(p_start, p_end - 1, '1 day') d
       WHERE to_char(d, 'MM-DD') BETWEEN v_peak_start AND v_peak_end
    ) INTO v_peak;
  END IF;

  FOR g IN
    SELECT COALESCE(NULLIF(e->>'accommodation_type',''), '') AS acc,
           count(*)::int AS pets,
           string_agg(COALESCE(NULLIF(e->>'name',''), 'Pet'), ', ' ORDER BY ordinality) AS names,
           min(ordinality) AS ord
      FROM jsonb_array_elements(COALESCE(p_pets, '[]'::jsonb)) WITH ORDINALITY AS t(e, ordinality)
     GROUP BY 1
     ORDER BY min(ordinality)
  LOOP
    SELECT * INTO v_rate FROM public.hotel_rate_cards
     WHERE tenant_id = p_tenant_id
       AND species = p_species
       AND accommodation_type = g.acc
       AND active = true
     LIMIT 1;

    IF v_rate.id IS NULL THEN
      RAISE EXCEPTION 'No active hotel rate configured for % accommodation "%". Choose an accommodation type with a rate card.',
        p_species, COALESCE(NULLIF(g.acc, ''), '(none selected)');
    END IF;
    IF COALESCE(v_rate.nightly_rate_zar, 0) <= 0 THEN
      RAISE EXCEPTION 'Hotel rate "%" has no nightly price set.', v_rate.display_name;
    END IF;

    v_uplift := CASE WHEN v_peak THEN COALESCE(v_rate.peak_uplift_pct, 0) ELSE 0 END;
    v_nightly := CASE WHEN v_uplift > 0
                      THEN ROUND(v_rate.nightly_rate_zar * (1 + v_uplift/100), 2)
                      ELSE v_rate.nightly_rate_zar END;

    description := 'Hotel stay — ' || COALESCE(v_rate.display_name, g.acc, 'boarding')
      || ' (' || split_part(g.names, ', ', 1) || ')'
      || ' · ' || v_nights || ' night' || CASE WHEN v_nights = 1 THEN '' ELSE 's' END
      || CASE WHEN v_uplift > 0 THEN ' · peak +' || v_uplift || '%' ELSE '' END
      || ' · ' || v_dates;
    quantity := v_nights;
    unit_price := v_nightly;
    line_total := ROUND(v_nightly * v_nights, 2);
    RETURN NEXT;

    v_extra := GREATEST(0, g.pets - 1);
    IF v_extra > 0 THEN
      IF COALESCE(v_rate.extra_pet_rate_zar, 0) > 0 THEN
        description := 'Extra pet in ' || COALESCE(v_rate.display_name, g.acc, 'same area')
          || ' (' || substring(g.names from position(', ' in g.names) + 2) || ')'
          || ' · ' || v_nights || ' night' || CASE WHEN v_nights = 1 THEN '' ELSE 's' END
          || ' · ' || v_dates;
        quantity := v_extra * v_nights;
        unit_price := v_rate.extra_pet_rate_zar;
        line_total := ROUND(v_rate.extra_pet_rate_zar * v_extra * v_nights, 2);
        RETURN NEXT;
      END IF;
    END IF;
  END LOOP;

  RETURN;
END; $$;

REVOKE ALL ON FUNCTION public.hotel_stay_lines_pets(uuid, text, date, date, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hotel_stay_lines_pets(uuid, text, date, date, jsonb) TO authenticated, service_role;

-- 4. Invoice trigger uses per-pet pricing when present ----------------
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
  v_pets jsonb;
  v_per_pet boolean := false;
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

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'name', p.name,
           'accommodation_type', COALESCE(NULLIF(bp.accommodation_type,''), NEW.accommodation_type))
         ORDER BY bp.sort_order, p.name), '[]'::jsonb),
         bool_or(NULLIF(bp.accommodation_type,'') IS NOT NULL)
    INTO v_pets, v_per_pet
    FROM public.booking_pets bp
    JOIN public.pets p ON p.id = bp.pet_id
   WHERE bp.booking_id = v_booking.id;

  v_per_pet := COALESCE(v_per_pet, false) AND jsonb_array_length(COALESCE(v_pets,'[]'::jsonb)) > 0;

  IF v_booking.invoice_id IS NOT NULL AND public._invoice_locked(v_booking.invoice_id) THEN
    SELECT status::text, total INTO v_status, v_old_total
      FROM public.invoices WHERE id = v_booking.invoice_id;

    IF v_per_pet THEN
      SELECT COALESCE(SUM(line_total), 0) INTO v_new_total
        FROM public.hotel_stay_lines_pets(NEW.tenant_id, v_species, v_start, v_end, v_pets);
    ELSE
      SELECT COALESCE(SUM(line_total), 0) INTO v_new_total
        FROM public.hotel_stay_lines(NEW.tenant_id, v_species, NEW.accommodation_type, v_start, v_end, v_pet_count);
    END IF;

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
      jsonb_build_object('booking_id', v_booking.id, 'start_date', v_start, 'end_date', v_end,
                         'invoice_total', v_old_total, 'recalculated_stay_total', v_new_total));
    RETURN NEW;
  END IF;

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

  IF v_per_pet THEN
    FOR r IN
      SELECT * FROM public.hotel_stay_lines_pets(NEW.tenant_id, v_species, v_start, v_end, v_pets)
    LOOP
      INSERT INTO public.invoice_items(tenant_id, invoice_id, booking_id, description, quantity, unit_price, line_total, sort_order, source_type, source_id)
      VALUES (v_booking.tenant_id, v_inv, v_booking.id, r.description,
        r.quantity, r.unit_price, r.line_total, v_sort, 'hotel_stay', v_booking.id);
      v_sort := v_sort + 1;
    END LOOP;
  ELSE
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
  END IF;

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

  IF v_xero IS NOT NULL AND v_new_total IS DISTINCT FROM v_old_total THEN
    INSERT INTO public.xero_sync_queue(tenant_id, entity_type, entity_id, status, run_after)
    VALUES (v_booking.tenant_id, 'invoice', v_inv, 'pending', now())
    ON CONFLICT (tenant_id, entity_type, entity_id)
    DO UPDATE SET status = 'pending', run_after = now(), attempts = 0, last_error = NULL, updated_at = now();
  END IF;

  RETURN NEW;
END;
$function$;

-- 5. Quote acceptance carries per-pet accommodation --------------------
CREATE OR REPLACE FUNCTION public.accept_estimate(p_estimate_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_e public.estimates;
  v_booking uuid;
  v_num text;
  v_pet uuid;
  v_s jsonb;
  v_idx integer := 0;
  v_acc text;
BEGIN
  SELECT * INTO v_e FROM public.estimates WHERE id = p_estimate_id;
  IF v_e.id IS NULL THEN RAISE EXCEPTION 'Quote not found'; END IF;
  IF NOT public.user_has_tenant_access(v_e.tenant_id)
     AND COALESCE(current_setting('app.public_quote_accept', true), '') <> 'on' THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;
  IF v_e.booking_id IS NOT NULL THEN RETURN v_e.booking_id; END IF;
  IF v_e.start_at IS NULL THEN RAISE EXCEPTION 'Quote has no stay dates'; END IF;

  v_num := public.next_booking_number(v_e.tenant_id);

  INSERT INTO public.bookings(
    tenant_id, customer_id, booking_number, service_type, status,
    start_at, end_at, start_date, end_date, source, notes)
  VALUES (
    v_e.tenant_id, v_e.customer_id, v_num,
    COALESCE(v_e.service_type, 'hotel_dog'::public.service_type), 'confirmed',
    v_e.start_at, v_e.end_at, v_e.start_at::date, v_e.end_at::date,
    'staff_capture', 'Created from quote ' || COALESCE(v_e.estimate_number,''))
  RETURNING id INTO v_booking;

  FOREACH v_pet IN ARRAY COALESCE(v_e.pet_ids, '{}'::uuid[]) LOOP
    SELECT NULLIF(e->>'accommodation_type','') INTO v_acc
      FROM jsonb_array_elements(COALESCE(v_e.extras->'pets','[]'::jsonb)) e
     WHERE (e->>'pet_id')::uuid = v_pet
     LIMIT 1;

    INSERT INTO public.booking_pets(tenant_id, booking_id, pet_id, accommodation_type, sort_order)
    VALUES (v_e.tenant_id, v_booking, v_pet, COALESCE(v_acc, v_e.accommodation_type), v_idx)
    ON CONFLICT DO NOTHING;
    v_idx := v_idx + 1;
  END LOOP;

  INSERT INTO public.hotel_booking_details(
    tenant_id, booking_id, accommodation_type,
    check_in_window, check_out_window, additional_notes)
  VALUES (
    v_e.tenant_id, v_booking, v_e.accommodation_type,
    NULLIF(v_e.extras->>'check_in_window',''),
    NULLIF(v_e.extras->>'check_out_window',''),
    NULLIF(v_e.extras->>'notes',''));

  FOR v_s IN SELECT * FROM jsonb_array_elements(COALESCE(v_e.extras->'surcharges','[]'::jsonb))
  LOOP
    INSERT INTO public.hotel_booking_surcharges(tenant_id, booking_id, surcharge_id, quantity)
    VALUES (v_e.tenant_id, v_booking, (v_s->>'surcharge_id')::uuid,
            COALESCE((v_s->>'quantity')::numeric, 1));
  END LOOP;

  IF COALESCE(v_e.extras->'pets', '[]'::jsonb) <> '[]'::jsonb THEN
    PERFORM public.sync_hotel_grooming_requests(v_booking, jsonb_build_object('pets', v_e.extras->'pets'));
  END IF;

  UPDATE public.estimates
     SET status = 'accepted', accepted_at = now(), booking_id = v_booking, updated_at = now()
   WHERE id = p_estimate_id;

  RETURN v_booking;
END; $function$;

-- 6. Occupancy counts each pet against the area it is actually in ------
CREATE OR REPLACE FUNCTION public.hotel_day_availability(
  p_tenant_id uuid,
  p_start date,
  p_end date,
  p_exclude_booking_id uuid DEFAULT NULL
)
RETURNS TABLE(resource_id uuid, resource_name text, capacity integer, day date, used integer)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH days AS (
    SELECT generate_series(p_start, GREATEST(p_start, p_end - 1), interval '1 day')::date AS d
  ),
  res AS (
    SELECT r.id, r.name, r.capacity
    FROM public.resources r
    WHERE r.tenant_id = p_tenant_id
      AND r.active
      AND r.type IN ('hotel_area','cattery_area')
  ),
  stays AS (
    SELECT b.id, b.resource_id,
           (b.start_at AT TIME ZONE 'Africa/Johannesburg')::date AS s,
           COALESCE((b.end_at AT TIME ZONE 'Africa/Johannesburg')::date, (b.start_at AT TIME ZONE 'Africa/Johannesburg')::date + 1) AS e
    FROM public.bookings b
    WHERE b.tenant_id = p_tenant_id
      AND b.service_type IN ('hotel_dog','hotel_cat')
      AND b.status NOT IN ('cancelled','no_show','completed','checked_out')
      AND (p_exclude_booking_id IS NULL OR b.id <> p_exclude_booking_id)
      AND b.resource_id IS NOT NULL
  ),
  occ AS (
    SELECT COALESCE(bp.resource_id, st.resource_id) AS resource_id, st.s, st.e, 1 AS pet_count
    FROM stays st
    JOIN public.booking_pets bp ON bp.booking_id = st.id
    UNION ALL
    SELECT st.resource_id, st.s, st.e, 1
    FROM stays st
    WHERE NOT EXISTS (SELECT 1 FROM public.booking_pets bp WHERE bp.booking_id = st.id)
  )
  SELECT res.id, res.name, res.capacity, days.d,
         COALESCE((
           SELECT sum(o.pet_count)::int FROM occ o
           WHERE o.resource_id = res.id AND days.d >= o.s AND days.d < o.e
         ), 0) AS used
  FROM res CROSS JOIN days
  WHERE public.user_has_tenant_access(p_tenant_id)
  ORDER BY res.name, days.d;
$$;

REVOKE ALL ON FUNCTION public.hotel_day_availability(uuid, date, date, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hotel_day_availability(uuid, date, date, uuid) TO authenticated, service_role;