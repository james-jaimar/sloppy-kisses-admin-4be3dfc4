CREATE OR REPLACE FUNCTION public.portal_hotel_quote_settings(p_tenant_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT jsonb_build_object(
    'enabled', COALESCE(s.portal_quotes_enabled, true),
    'hold_hours', COALESCE(s.portal_quote_hold_hours, 48),
    'max_active', COALESCE(s.portal_quote_max_active, 3)
  )
  FROM (SELECT 1) x
  LEFT JOIN public.hotel_workflow_settings s ON s.tenant_id = p_tenant_id;
$$;

REVOKE ALL ON FUNCTION public.portal_hotel_quote_settings(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.portal_hotel_quote_settings(uuid) TO authenticated, service_role;