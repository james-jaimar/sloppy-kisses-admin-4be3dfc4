REVOKE EXECUTE ON FUNCTION public.transport_day_load(uuid, date, date, uuid) FROM anon;

CREATE OR REPLACE FUNCTION public.portal_service_gates(p_tenant_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_allowed boolean;
  v_hotel_mode text;
  v_daycare_cap int;
  v_transport_mode text;
  v_transport_max int;
BEGIN
  SELECT public.user_has_tenant_access(p_tenant_id)
      OR EXISTS (
        SELECT 1 FROM public.customers c
        WHERE c.tenant_id = p_tenant_id
          AND c.linked_profile_id = public.current_profile_id()
      )
  INTO v_allowed;

  IF NOT v_allowed THEN
    RAISE EXCEPTION 'Not authorised for this tenant';
  END IF;

  SELECT overbooking_mode::text INTO v_hotel_mode
  FROM public.hotel_workflow_settings WHERE tenant_id = p_tenant_id;

  SELECT daily_capacity INTO v_daycare_cap
  FROM public.daycare_workflow_settings WHERE tenant_id = p_tenant_id;

  SELECT overbooking_mode, max_stops_per_van_per_day
    INTO v_transport_mode, v_transport_max
  FROM public.transport_workflow_settings WHERE tenant_id = p_tenant_id;

  RETURN jsonb_build_object(
    'hotel_overbooking_mode', COALESCE(v_hotel_mode, 'warn'),
    'daycare_daily_capacity', v_daycare_cap,
    'transport_overbooking_mode', COALESCE(v_transport_mode, 'warn'),
    'transport_max_stops_per_van_per_day', COALESCE(v_transport_max, 12)
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.portal_service_gates(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.portal_service_gates(uuid) TO authenticated;