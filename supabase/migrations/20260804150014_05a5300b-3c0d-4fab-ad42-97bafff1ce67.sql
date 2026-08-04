CREATE POLICY "hotel_booking_details_customer_read"
ON public.hotel_booking_details FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.bookings b
  WHERE b.id = hotel_booking_details.booking_id
    AND b.customer_id = public.current_customer_id(b.tenant_id)
));

CREATE POLICY "form_submissions_customer_read"
ON public.form_submissions FOR SELECT TO authenticated
USING (customer_id IS NOT NULL AND customer_id = public.current_customer_id(tenant_id));

CREATE OR REPLACE FUNCTION public.submit_accommodation_form(p_booking_id uuid, p_payload jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
    COALESCE((p_payload->>'grooming_required')::boolean, false),
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

  RETURN v_sub;
END;
$$;

REVOKE ALL ON FUNCTION public.submit_accommodation_form(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_accommodation_form(uuid, jsonb) TO authenticated;