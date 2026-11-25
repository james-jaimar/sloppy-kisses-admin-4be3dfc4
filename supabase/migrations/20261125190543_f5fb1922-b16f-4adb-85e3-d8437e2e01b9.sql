CREATE OR REPLACE FUNCTION public.schedule_hotel_groom(p_request_id uuid, p_start_at timestamp with time zone, p_end_at timestamp with time zone, p_package_id uuid DEFAULT NULL::uuid, p_resource_id uuid DEFAULT NULL::uuid, p_notes text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_r public.hotel_grooming_requests%ROWTYPE;
  v_hotel public.bookings%ROWTYPE;
  v_booking_id uuid; v_num text; v_minutes integer;
  legacy_billed boolean:=false; legacy_auto boolean; v_billed_inv uuid; v_suppress boolean:=false;
BEGIN
  SELECT * INTO v_r FROM public.hotel_grooming_requests WHERE id = p_request_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Request not found'; END IF;
  IF NOT public.user_has_tenant_access(v_r.tenant_id) THEN RAISE EXCEPTION 'Not authorised'; END IF;
  SELECT i.id INTO v_billed_inv FROM public.invoices i WHERE i.id=v_r.billed_invoice_id AND i.status::text<>'cancelled';
  IF v_billed_inv IS NOT NULL AND p_package_id IS NOT NULL AND v_r.package_id IS NOT NULL AND p_package_id<>v_r.package_id THEN
    RAISE EXCEPTION 'This groom is already on the hotel invoice with its chosen package. Keep that package, or use Adjust & re-bill to change it.';
  END IF;
  p_package_id := COALESCE(p_package_id,v_r.package_id);
  IF p_package_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.grooming_packages gp WHERE gp.id=p_package_id AND gp.tenant_id=v_r.tenant_id AND gp.active) THEN RAISE EXCEPTION 'Choose an active grooming package for this account'; END IF;
  IF v_r.status = 'scheduled' THEN RAISE EXCEPTION 'Already scheduled'; END IF;
  IF v_r.pet_id IS NULL THEN RAISE EXCEPTION 'This request has no linked pet — link the pet first'; END IF;

  SELECT * INTO v_hotel FROM public.bookings WHERE id = v_r.hotel_booking_id;
  SELECT EXISTS(SELECT 1 FROM public.estimates e WHERE e.booking_id=v_hotel.id AND e.tenant_id=v_r.tenant_id AND e.created_via='hotel_sheet_import' AND (e.extras->'legacy_hotel_import'->'billed_groom_pet_ids') ? v_r.pet_id::text) INTO legacy_billed;

  IF NOT legacy_billed AND v_billed_inv IS NULL AND EXISTS(
    SELECT 1 FROM public.estimates e CROSS JOIN LATERAL jsonb_array_elements(coalesce(nullif(e.extras->'legacy_hotel_import'->'source_invoice','null'::jsonb),e.extras->'legacy_hotel_import'->'source_quote')->'LineItems') li
    WHERE e.booking_id=v_hotel.id AND e.created_via='hotel_sheet_import' AND coalesce(li->>'ItemCode','') ~* '^(DG|CG)'
  ) THEN RAISE EXCEPTION 'The imported hotel bill includes grooming but its pet allocation needs review; do not charge another groom until this is checked'; END IF;
  IF legacy_billed THEN
    IF v_hotel.invoice_id IS NULL THEN RAISE EXCEPTION 'This groom is included in the imported hotel quote; confirm the hotel invoice before scheduling it'; END IF;
    IF cardinality(coalesce(v_r.addon_ids,'{}'::uuid[]))>0 THEN RAISE EXCEPTION 'This imported groom is already billed; review any new extras separately before scheduling'; END IF;
    v_billed_inv := v_hotel.invoice_id;
  END IF;
  v_suppress := v_billed_inv IS NOT NULL;
  IF v_suppress THEN
    SELECT auto_invoice_grooming INTO legacy_auto FROM public.invoicing_settings WHERE tenant_id=v_r.tenant_id FOR UPDATE;
    UPDATE public.invoicing_settings SET auto_invoice_grooming=false WHERE tenant_id=v_r.tenant_id;
  END IF;

  IF p_start_at::date < COALESCE(v_r.window_start, p_start_at::date)
     OR p_start_at::date > COALESCE(v_r.window_end, p_start_at::date) THEN
    RAISE EXCEPTION 'Slot must fall inside the hotel stay (% to %)', v_r.window_start, v_r.window_end;
  END IF;

  v_num := public.next_booking_number(v_r.tenant_id);
  INSERT INTO public.bookings(tenant_id, customer_id, booking_number, service_type, source, status,
    start_at, end_at, start_date, end_date, resource_id, notes_internal)
  VALUES (v_r.tenant_id, v_r.customer_id, v_num, 'grooming_inhouse', 'staff_capture', 'confirmed',
    p_start_at, p_end_at, p_start_at::date, COALESCE(p_end_at, p_start_at)::date, p_resource_id,
    'Hotel guest groom — stay ' || COALESCE(v_hotel.booking_number,''))
  RETURNING id INTO v_booking_id;

  IF v_suppress THEN
    UPDATE public.bookings SET invoice_id=v_billed_inv, parent_booking_id=v_hotel.id,
      notes_internal=coalesce(notes_internal,'')||E'\nGroom already included on the hotel invoice; no additional charge.'
     WHERE id=v_booking_id;
  END IF;

  INSERT INTO public.booking_pets(tenant_id, booking_id, pet_id) VALUES (v_r.tenant_id, v_booking_id, v_r.pet_id);

  UPDATE public.hotel_grooming_requests
     SET status='scheduled', grooming_booking_id=v_booking_id, scheduled_at=now(), package_id=COALESCE(package_id,p_package_id),
         handled_by=public.current_profile_id(), updated_at=now()
   WHERE id = p_request_id;

  IF p_package_id IS NOT NULL THEN
    SELECT expected_minutes INTO v_minutes FROM public.grooming_packages WHERE id = p_package_id;
  END IF;
  INSERT INTO public.grooming_booking_details(tenant_id, booking_id, grooming_mode, package_id, duration_minutes, grooming_notes)
  VALUES (v_r.tenant_id, v_booking_id, 'inhouse', p_package_id, v_minutes,
    NULLIF(TRIM(COALESCE(v_r.customer_notes,'') || CASE WHEN p_notes IS NOT NULL THEN E'\n' || p_notes ELSE '' END), ''));

  INSERT INTO public.grooming_booking_addons(tenant_id,booking_id,addon_id,addon_code,addon_name,qty,price_zar_snapshot)
    SELECT v_r.tenant_id,v_booking_id,ga.id,ga.code,ga.name,1,ga.price_zar FROM public.grooming_addons ga
    WHERE ga.id=ANY(v_r.addon_ids) AND ga.tenant_id=v_r.tenant_id;
  UPDATE public.bookings SET requires_grooming = true WHERE id = v_r.hotel_booking_id;

  IF v_suppress THEN
    UPDATE public.invoicing_settings SET auto_invoice_grooming=legacy_auto WHERE tenant_id=v_r.tenant_id;
  END IF;
  RETURN v_booking_id;
END; $function$;

CREATE OR REPLACE FUNCTION public.sync_hotel_grooming_requests(p_booking_id uuid, p_payload jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_b public.bookings%ROWTYPE;
  v_pet jsonb;
  v_pet_id uuid;
  v_name text;
  v_keep uuid[] := '{}';
  v_id uuid;
  v_any boolean := false;
BEGIN
  SELECT * INTO v_b FROM public.bookings WHERE id = p_booking_id;
  IF NOT FOUND THEN RETURN; END IF;
  IF v_b.service_type::text NOT IN ('hotel_dog','hotel_cat') THEN RETURN; END IF;

  FOR v_pet IN SELECT * FROM jsonb_array_elements(COALESCE(p_payload->'pets','[]'::jsonb))
  LOOP
    IF NOT COALESCE((v_pet->>'grooming_required')::boolean, false) THEN CONTINUE; END IF;
    v_any := true;
    v_pet_id := NULLIF(v_pet->>'pet_id','')::uuid;
    v_name := NULLIF(v_pet->>'name','');

    INSERT INTO public.hotel_grooming_requests(
      tenant_id, hotel_booking_id, pet_id, customer_id, pet_name,
      window_start, window_end, customer_notes, status
    ) VALUES (
      v_b.tenant_id, p_booking_id, v_pet_id, v_b.customer_id, v_name,
      COALESCE(v_b.start_date, v_b.start_at::date),
      COALESCE(v_b.end_date, v_b.end_at::date),
      NULLIF(v_pet->>'grooming_notes',''), 'pending'
    )
    ON CONFLICT (hotel_booking_id, COALESCE(pet_id::text, lower(coalesce(pet_name,''))))
    DO UPDATE SET
      customer_notes = COALESCE(EXCLUDED.customer_notes, public.hotel_grooming_requests.customer_notes),
      window_start = EXCLUDED.window_start,
      window_end = EXCLUDED.window_end,
      pet_name = COALESCE(EXCLUDED.pet_name, public.hotel_grooming_requests.pet_name),
      status = CASE WHEN public.hotel_grooming_requests.status = 'cancelled'
                    THEN 'pending' ELSE public.hotel_grooming_requests.status END,
      updated_at = now()
    RETURNING id INTO v_id;

    UPDATE public.hotel_grooming_requests SET package_id = (SELECT gp.id FROM public.grooming_packages gp WHERE gp.id::text=v_pet->>'grooming_package_id' AND gp.tenant_id=v_b.tenant_id AND gp.active) WHERE id=v_id AND (status='pending' OR (package_id IS NULL AND billed_invoice_id IS NULL AND status='scheduled')) AND v_pet ? 'grooming_package_id';
    v_keep := array_append(v_keep, v_id);
  END LOOP;

  IF NOT v_any AND COALESCE((p_payload->>'grooming_required')::boolean, false) THEN
    FOR v_pet_id, v_name IN
      SELECT p.id, p.name FROM public.booking_pets bp
        JOIN public.pets p ON p.id = bp.pet_id
       WHERE bp.booking_id = p_booking_id
    LOOP
      INSERT INTO public.hotel_grooming_requests(
        tenant_id, hotel_booking_id, pet_id, customer_id, pet_name,
        window_start, window_end, customer_notes, status
      ) VALUES (
        v_b.tenant_id, p_booking_id, v_pet_id, v_b.customer_id, v_name,
        COALESCE(v_b.start_date, v_b.start_at::date),
        COALESCE(v_b.end_date, v_b.end_at::date),
        NULLIF(p_payload->>'grooming_instructions',''), 'pending'
      )
      ON CONFLICT (hotel_booking_id, COALESCE(pet_id::text, lower(coalesce(pet_name,''))))
      DO UPDATE SET updated_at = now()
      RETURNING id INTO v_id;
      v_keep := array_append(v_keep, v_id);
    END LOOP;
  END IF;

  UPDATE public.hotel_grooming_requests
     SET status = 'cancelled', updated_at = now()
   WHERE hotel_booking_id = p_booking_id
     AND status = 'pending'
     AND NOT (id = ANY(v_keep));
END; $function$;