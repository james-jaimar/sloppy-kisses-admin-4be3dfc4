CREATE OR REPLACE FUNCTION public.draft_hotel_pet_removal_credit(p_booking_id uuid, p_old_pets jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  b record; inv record; v_new jsonb; v_disc numeric := 0;
  v_nights int; g record; v_old numeric; v_newt numeric; v_diff numeric;
  v_cn uuid; v_num text; v_sort int := 0; v_names text; v_species text;
BEGIN
  SELECT * INTO b FROM public.bookings WHERE id = p_booking_id;
  IF b.id IS NULL THEN RAISE EXCEPTION 'Booking not found'; END IF;
  IF NOT public.user_has_permission(b.tenant_id, 'credit_notes.create') THEN
    RAISE EXCEPTION 'You do not have permission to create credit notes';
  END IF;
  SELECT id, customer_id, invoice_number INTO inv FROM public.invoices
   WHERE booking_id = b.id AND tenant_id = b.tenant_id
     AND status IN ('issued','sent','part_paid','paid','overdue')
   ORDER BY created_at LIMIT 1;
  IF inv.id IS NULL THEN RETURN NULL; END IF;

  v_species := CASE WHEN b.service_type = 'hotel_cat' THEN 'cat' ELSE 'dog' END;
  SELECT COALESCE(discount_pct, 0) INTO v_disc FROM public.hotel_booking_details WHERE booking_id = b.id;
  v_disc := COALESCE(v_disc, 0);
  v_nights := GREATEST(1, COALESCE(b.end_at::date - b.start_at::date, 1));

  SELECT COALESCE(jsonb_agg(jsonb_build_object('name', p.name, 'species', p.species::text,
           'accommodation_type', COALESCE(bp.accommodation_type, ''), 'pet_id', p.id) ORDER BY bp.sort_order), '[]'::jsonb)
    INTO v_new
    FROM public.booking_pets bp JOIN public.pets p ON p.id = bp.pet_id
   WHERE bp.booking_id = b.id;

  FOR g IN
    SELECT COALESCE(NULLIF(e->>'species',''), v_species) AS species,
           COALESCE(e->>'accommodation_type','') AS acc
      FROM jsonb_array_elements(p_old_pets) e GROUP BY 1, 2
  LOOP
    SELECT COALESCE(sum(l.line_total), 0) INTO v_old FROM public.hotel_stay_lines_pets(b.tenant_id, v_species,
      b.start_at::date, b.end_at::date,
      (SELECT jsonb_agg(e) FROM jsonb_array_elements(p_old_pets) e
        WHERE COALESCE(NULLIF(e->>'species',''), v_species) = g.species AND COALESCE(e->>'accommodation_type','') = g.acc)) l;
    SELECT COALESCE(sum(l.line_total), 0) INTO v_newt FROM public.hotel_stay_lines_pets(b.tenant_id, v_species,
      b.start_at::date, b.end_at::date,
      COALESCE((SELECT jsonb_agg(e) FROM jsonb_array_elements(v_new) e
        WHERE COALESCE(NULLIF(e->>'species',''), v_species) = g.species AND COALESCE(e->>'accommodation_type','') = g.acc), '[]'::jsonb)) l;
    v_diff := ROUND((v_old - v_newt) * (1 - v_disc / 100), 2);
    IF v_diff <= 0 THEN CONTINUE; END IF;

    SELECT string_agg(COALESCE(e->>'name','Pet'), ', ') INTO v_names
      FROM jsonb_array_elements(p_old_pets) e
     WHERE COALESCE(NULLIF(e->>'species',''), v_species) = g.species AND COALESCE(e->>'accommodation_type','') = g.acc
       AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_new) n WHERE n->>'pet_id' = e->>'pet_id');

    IF v_cn IS NULL THEN
      v_num := public.next_credit_note_number(b.tenant_id);
      INSERT INTO public.credit_notes (tenant_id, credit_note_number, customer_id, invoice_id, status, reason, notes, created_by)
      VALUES (b.tenant_id, v_num, inv.customer_id, inv.id, 'draft', 'Pet removed from hotel stay',
              'Drafted automatically for ' || b.booking_number || ' against invoice ' || inv.invoice_number
              || '. Review extras (walks, Stay & Play) separately before issuing.', auth.uid())
      RETURNING id INTO v_cn;
    END IF;
    INSERT INTO public.credit_note_items (tenant_id, credit_note_id, description, quantity, unit_price, line_total, sort_order)
    VALUES (b.tenant_id, v_cn,
      'Pet removed: ' || COALESCE(v_names, 'pet') || ' — ' || g.species || ' stay'
        || CASE WHEN g.acc <> '' THEN ' (' || g.acc || ')' ELSE '' END
        || ' · ' || v_nights || ' night' || CASE WHEN v_nights = 1 THEN '' ELSE 's' END
        || CASE WHEN v_disc > 0 THEN ' · less ' || v_disc || '% discount' ELSE '' END,
      v_nights, ROUND(v_diff / v_nights, 2), ROUND(v_diff / v_nights, 2) * v_nights, v_sort);
    v_sort := v_sort + 1;
  END LOOP;
  RETURN v_cn;
END; $$;
REVOKE ALL ON FUNCTION public.draft_hotel_pet_removal_credit(uuid, jsonb) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.draft_hotel_pet_removal_credit(uuid, jsonb) TO authenticated, service_role;