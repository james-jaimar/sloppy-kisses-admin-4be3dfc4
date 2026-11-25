CREATE OR REPLACE FUNCTION public.hotel_paperwork_alerts(p_tenant_id uuid, p_days integer DEFAULT 60)
RETURNS TABLE(booking_id uuid, booking_number text, start_date date, customer_name text, pet_names text, issues text[])
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NOT (public.user_has_permission(p_tenant_id,'hotel.view') OR public.user_has_permission(p_tenant_id,'bookings.view')) THEN RAISE EXCEPTION 'Permission required'; END IF;
  RETURN QUERY
  WITH stays AS (
    SELECT b.id, b.booking_number, COALESCE(b.start_date,(b.start_at AT TIME ZONE 'Africa/Johannesburg')::date) sd, b.customer_id, b.vax_override_by
    FROM public.bookings b JOIN public.hotel_booking_reviews r ON r.booking_id=b.id
    WHERE b.tenant_id=p_tenant_id AND b.service_type IN ('hotel_dog','hotel_cat')
      AND b.status IN ('confirmed','pending_payment','approved','needs_info')
      AND (r.confirmed_at IS NOT NULL OR r.verified_payment_id IS NOT NULL OR b.invoice_id IS NOT NULL)
      AND COALESCE(b.start_date,(b.start_at AT TIME ZONE 'Africa/Johannesburg')::date) BETWEEN (now() AT TIME ZONE 'Africa/Johannesburg')::date AND (now() AT TIME ZONE 'Africa/Johannesburg')::date + p_days
  ), iss AS (
    SELECT s.id, array_remove(
      ARRAY(SELECT DISTINCT 'Vaccinations: '||g.pet_name||' ('||g.label||')' FROM public.booking_vaccination_gate(s.id) g WHERE s.vax_override_by IS NULL AND g.status IN ('missing','expired','no_certificate'))
      || ARRAY(SELECT c->>'label' FROM public.hotel_workflow_settings ws, jsonb_array_elements(COALESCE(ws.approval_checklist,'[]')) c, public.hotel_booking_reviews r WHERE ws.tenant_id=p_tenant_id AND r.booking_id=s.id AND c->>'code' NOT IN ('vaccinations','vaccination','vax') AND COALESCE((r.checklist->>(c->>'code'))::boolean,false)=false), NULL) arr
    FROM stays s
  )
  SELECT s.id, s.booking_number, s.sd,
    trim(COALESCE(cu.first_name,'')||' '||COALESCE(cu.last_name,'')),
    (SELECT string_agg(p.name, ', ' ORDER BY bp.sort_order) FROM public.booking_pets bp JOIN public.pets p ON p.id=bp.pet_id WHERE bp.booking_id=s.id),
    i.arr
  FROM stays s JOIN iss i ON i.id=s.id LEFT JOIN public.customers cu ON cu.id=s.customer_id
  WHERE cardinality(i.arr)>0
  ORDER BY s.sd;
END $$;
REVOKE ALL ON FUNCTION public.hotel_paperwork_alerts(uuid,integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hotel_paperwork_alerts(uuid,integer) TO authenticated;