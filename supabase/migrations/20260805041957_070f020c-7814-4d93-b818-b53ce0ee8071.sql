CREATE OR REPLACE FUNCTION public.get_hotel_guidelines(p_tenant uuid)
RETURNS TABLE (guidelines_md text, guidelines_version integer)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT s.guidelines_md, s.guidelines_version
  FROM public.hotel_workflow_settings s
  WHERE s.tenant_id = p_tenant
  LIMIT 1
$$;

REVOKE ALL ON FUNCTION public.get_hotel_guidelines(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_hotel_guidelines(uuid) TO authenticated, service_role;