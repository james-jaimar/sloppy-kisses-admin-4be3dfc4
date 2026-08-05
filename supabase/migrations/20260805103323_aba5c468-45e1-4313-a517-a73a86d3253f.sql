CREATE TABLE public.hotel_grooming_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  hotel_booking_id uuid NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  pet_id uuid REFERENCES public.pets(id) ON DELETE SET NULL,
  customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  pet_name text,
  window_start date,
  window_end date,
  customer_notes text,
  status text NOT NULL DEFAULT 'pending',
  grooming_booking_id uuid REFERENCES public.bookings(id) ON DELETE SET NULL,
  scheduled_at timestamptz,
  decline_reason text,
  handled_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT hotel_grooming_requests_status_chk
    CHECK (status IN ('pending','scheduled','declined','cancelled'))
);

CREATE UNIQUE INDEX hotel_grooming_requests_booking_pet_uq
  ON public.hotel_grooming_requests(hotel_booking_id, COALESCE(pet_id::text, lower(coalesce(pet_name,''))));
CREATE INDEX hotel_grooming_requests_queue_idx
  ON public.hotel_grooming_requests(tenant_id, status, window_start);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.hotel_grooming_requests TO authenticated;
GRANT ALL ON public.hotel_grooming_requests TO service_role;

ALTER TABLE public.hotel_grooming_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY hotel_grooming_requests_staff_all ON public.hotel_grooming_requests
  FOR ALL TO authenticated
  USING (public.user_has_tenant_access(tenant_id))
  WITH CHECK (public.user_has_tenant_access(tenant_id));

CREATE POLICY hotel_grooming_requests_customer_select ON public.hotel_grooming_requests
  FOR SELECT TO authenticated
  USING (customer_id = public.current_customer_id(tenant_id));

CREATE TRIGGER trg_hotel_grooming_requests_updated_at
  BEFORE UPDATE ON public.hotel_grooming_requests
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Sync requests from an accommodation form payload
CREATE OR REPLACE FUNCTION public.sync_hotel_grooming_requests(p_booking_id uuid, p_payload jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
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

    v_keep := array_append(v_keep, v_id);
  END LOOP;

  -- legacy booking-level tick (no per-pet data)
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

  -- untick => cancel still-pending requests
  UPDATE public.hotel_grooming_requests
     SET status = 'cancelled', updated_at = now()
   WHERE hotel_booking_id = p_booking_id
     AND status = 'pending'
     AND NOT (id = ANY(v_keep));
END; $$;

REVOKE ALL ON FUNCTION public.sync_hotel_grooming_requests(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sync_hotel_grooming_requests(uuid, jsonb) TO authenticated, service_role;

-- Schedule a groom for a request
CREATE OR REPLACE FUNCTION public.schedule_hotel_groom(
  p_request_id uuid,
  p_start_at timestamptz,
  p_end_at timestamptz,
  p_package_id uuid DEFAULT NULL,
  p_resource_id uuid DEFAULT NULL,
  p_notes text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_r public.hotel_grooming_requests%ROWTYPE;
  v_hotel public.bookings%ROWTYPE;
  v_booking_id uuid;
  v_num text;
  v_minutes integer;
BEGIN
  SELECT * INTO v_r FROM public.hotel_grooming_requests WHERE id = p_request_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Request not found'; END IF;
  IF NOT public.user_has_tenant_access(v_r.tenant_id) THEN RAISE EXCEPTION 'Not authorised'; END IF;
  IF v_r.status = 'scheduled' THEN RAISE EXCEPTION 'Already scheduled'; END IF;
  IF v_r.pet_id IS NULL THEN RAISE EXCEPTION 'This request has no linked pet — link the pet first'; END IF;

  SELECT * INTO v_hotel FROM public.bookings WHERE id = v_r.hotel_booking_id;

  IF p_start_at::date < COALESCE(v_r.window_start, p_start_at::date)
     OR p_start_at::date > COALESCE(v_r.window_end, p_start_at::date) THEN
    RAISE EXCEPTION 'Slot must fall inside the hotel stay (% to %)', v_r.window_start, v_r.window_end;
  END IF;

  v_num := public.next_booking_number(v_r.tenant_id);

  INSERT INTO public.bookings(
    tenant_id, customer_id, booking_number, service_type, source, status,
    start_at, end_at, start_date, end_date, resource_id, notes_internal
  ) VALUES (
    v_r.tenant_id, v_r.customer_id, v_num, 'grooming_inhouse', 'staff_capture', 'confirmed',
    p_start_at, p_end_at, p_start_at::date, COALESCE(p_end_at, p_start_at)::date,
    p_resource_id,
    'Hotel guest groom — stay ' || COALESCE(v_hotel.booking_number,'')
  ) RETURNING id INTO v_booking_id;

  INSERT INTO public.booking_pets(tenant_id, booking_id, pet_id)
  VALUES (v_r.tenant_id, v_booking_id, v_r.pet_id);

  IF p_package_id IS NOT NULL THEN
    SELECT expected_minutes INTO v_minutes FROM public.grooming_packages WHERE id = p_package_id;
  END IF;

  INSERT INTO public.grooming_booking_details(
    tenant_id, booking_id, grooming_mode, package_id, duration_minutes, grooming_notes
  ) VALUES (
    v_r.tenant_id, v_booking_id, 'inhouse', p_package_id, v_minutes,
    NULLIF(TRIM(COALESCE(v_r.customer_notes,'') || CASE WHEN p_notes IS NOT NULL THEN E'\n' || p_notes ELSE '' END), '')
  );

  UPDATE public.bookings SET requires_grooming = true WHERE id = v_r.hotel_booking_id;

  UPDATE public.hotel_grooming_requests
     SET status = 'scheduled',
         grooming_booking_id = v_booking_id,
         scheduled_at = now(),
         handled_by = public.current_profile_id(),
         updated_at = now()
   WHERE id = p_request_id;

  RETURN v_booking_id;
END; $$;

REVOKE ALL ON FUNCTION public.schedule_hotel_groom(uuid, timestamptz, timestamptz, uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.schedule_hotel_groom(uuid, timestamptz, timestamptz, uuid, uuid, text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.decline_hotel_groom(p_request_id uuid, p_reason text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_tenant uuid;
BEGIN
  SELECT tenant_id INTO v_tenant FROM public.hotel_grooming_requests WHERE id = p_request_id;
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'Request not found'; END IF;
  IF NOT public.user_has_tenant_access(v_tenant) THEN RAISE EXCEPTION 'Not authorised'; END IF;

  UPDATE public.hotel_grooming_requests
     SET status = 'declined', decline_reason = p_reason,
         handled_by = public.current_profile_id(), updated_at = now()
   WHERE id = p_request_id;
END; $$;

REVOKE ALL ON FUNCTION public.decline_hotel_groom(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.decline_hotel_groom(uuid, text) TO authenticated, service_role;

-- Hook the form submission into request sync
CREATE OR REPLACE FUNCTION public.submit_accommodation_form(p_booking_id uuid, p_payload jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_b public.bookings%ROWTYPE;
  v_staff boolean;
  v_sub uuid;
BEGIN
  SELECT * INTO v_b FROM public.bookings WHERE id = p_booking_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Booking not found';
  END IF;

  v_staff := public.user_has_tenant_access(v_b.tenant_id);
  IF NOT v_staff AND v_b.customer_id IS DISTINCT FROM public.current_customer_id(v_b.tenant_id) THEN
    RAISE EXCEPTION 'Not authorised';
  END IF;

  INSERT INTO public.form_submissions (tenant_id, form_type, payload, customer_id, source, status, processed_at)
  VALUES (
    v_b.tenant_id,
    'hotel_accommodation',
    p_payload,
    v_b.customer_id,
    CASE WHEN v_staff THEN 'staff_capture'::public.booking_source ELSE 'customer_portal'::public.booking_source END,
    'processed',
    now()
  )
  RETURNING id INTO v_sub;

  INSERT INTO public.hotel_booking_details AS h (
    tenant_id, booking_id, check_in_window, check_out_window,
    pickup_required, dropoff_required,
    feeding_instructions, medication_instructions,
    grooming_required, grooming_instructions,
    belongings_notes, emergency_notes, additional_notes,
    form_submission_id, form_received_at
  )
  VALUES (
    v_b.tenant_id, p_booking_id,
    NULLIF(p_payload->>'check_in_window',''),
    NULLIF(p_payload->>'check_out_window',''),
    COALESCE((p_payload->>'pickup_required')::boolean, false),
    COALESCE((p_payload->>'dropoff_required')::boolean, false),
    NULLIF(p_payload->>'feeding_instructions',''),
    NULLIF(p_payload->>'medication_instructions',''),
    COALESCE((p_payload->>'grooming_required')::boolean, false)
      OR EXISTS (
        SELECT 1 FROM jsonb_array_elements(COALESCE(p_payload->'pets','[]'::jsonb)) pt
         WHERE COALESCE((pt->>'grooming_required')::boolean, false)
      ),
    NULLIF(p_payload->>'grooming_instructions',''),
    NULLIF(p_payload->>'belongings_notes',''),
    NULLIF(p_payload->>'emergency_notes',''),
    NULLIF(p_payload->>'additional_notes',''),
    v_sub, now()
  )
  ON CONFLICT (booking_id) DO UPDATE SET
    check_in_window = COALESCE(EXCLUDED.check_in_window, h.check_in_window),
    check_out_window = COALESCE(EXCLUDED.check_out_window, h.check_out_window),
    pickup_required = EXCLUDED.pickup_required,
    dropoff_required = EXCLUDED.dropoff_required,
    feeding_instructions = COALESCE(EXCLUDED.feeding_instructions, h.feeding_instructions),
    medication_instructions = COALESCE(EXCLUDED.medication_instructions, h.medication_instructions),
    grooming_required = EXCLUDED.grooming_required,
    grooming_instructions = COALESCE(EXCLUDED.grooming_instructions, h.grooming_instructions),
    belongings_notes = COALESCE(EXCLUDED.belongings_notes, h.belongings_notes),
    emergency_notes = COALESCE(EXCLUDED.emergency_notes, h.emergency_notes),
    additional_notes = COALESCE(EXCLUDED.additional_notes, h.additional_notes),
    form_submission_id = EXCLUDED.form_submission_id,
    form_received_at = now(),
    updated_at = now();

  UPDATE public.form_submissions SET booking_request_id = NULL WHERE id = v_sub;

  PERFORM public.sync_hotel_grooming_requests(p_booking_id, p_payload);

  RETURN v_sub;
END;
$function$;