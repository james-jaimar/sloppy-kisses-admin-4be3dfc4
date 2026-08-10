
CREATE OR REPLACE FUNCTION public.vax_outstanding_by_pet(p_tenant uuid, p_customer uuid DEFAULT NULL)
RETURNS TABLE(customer_id uuid, pet_id uuid, pet_name text, outstanding integer)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.customer_id,
         p.id,
         p.name,
         (SELECT count(*)::int
            FROM public.pet_vaccination_status(p.id, NULL, CURRENT_DATE) s
           WHERE s.status NOT IN ('ok', 'waived'))
  FROM public.pets p
  WHERE p.tenant_id = p_tenant
    AND p.status = 'active'
    AND (p_customer IS NULL OR p.customer_id = p_customer);
$$;

REVOKE ALL ON FUNCTION public.vax_outstanding_by_pet(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.vax_outstanding_by_pet(uuid, uuid) TO authenticated, service_role;
