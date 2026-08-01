-- 1) Fix customer ownership checks: linked_profile_id stores profiles.id, not auth.uid()
DROP POLICY IF EXISTS gig_read_tenant ON public.grooming_instruction_groups;
CREATE POLICY gig_read_tenant ON public.grooming_instruction_groups
FOR SELECT TO authenticated
USING (
  public.user_has_tenant_access(tenant_id)
  OR tenant_id IN (SELECT c.tenant_id FROM public.customers c WHERE c.linked_profile_id = public.current_profile_id())
);

DROP POLICY IF EXISTS gio_read_tenant ON public.grooming_instruction_options;
CREATE POLICY gio_read_tenant ON public.grooming_instruction_options
FOR SELECT TO authenticated
USING (
  public.user_has_tenant_access(tenant_id)
  OR tenant_id IN (SELECT c.tenant_id FROM public.customers c WHERE c.linked_profile_id = public.current_profile_id())
);

DROP POLICY IF EXISTS pgd_customer_own ON public.pet_grooming_defaults;
CREATE POLICY pgd_customer_own ON public.pet_grooming_defaults
FOR ALL TO authenticated
USING (
  pet_id IN (
    SELECT p.id FROM public.pets p
    JOIN public.customers c ON c.id = p.customer_id
    WHERE c.linked_profile_id = public.current_profile_id()
  )
)
WITH CHECK (
  pet_id IN (
    SELECT p.id FROM public.pets p
    JOIN public.customers c ON c.id = p.customer_id
    WHERE c.linked_profile_id = public.current_profile_id()
  )
);

-- 2) Customers may read the active grooming catalogue for their tenant
CREATE POLICY grooming_packages_customer_select ON public.grooming_packages
FOR SELECT TO authenticated
USING (
  active
  AND tenant_id IN (SELECT c.tenant_id FROM public.customers c WHERE c.linked_profile_id = public.current_profile_id())
);

CREATE POLICY grooming_addons_customer_select ON public.grooming_addons
FOR SELECT TO authenticated
USING (
  active
  AND tenant_id IN (SELECT c.tenant_id FROM public.customers c WHERE c.linked_profile_id = public.current_profile_id())
);

-- 3) Safe grooming availability lookup for the portal slot picker
CREATE OR REPLACE FUNCTION public.grooming_day_availability(p_tenant_id uuid, p_day date)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_allowed boolean;
  v_pool int;
  v_busy jsonb;
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

  SELECT GREATEST(1, COUNT(*)::int) INTO v_pool
  FROM public.resources r
  WHERE r.tenant_id = p_tenant_id
    AND r.active
    AND r.type::text IN ('inhouse_grooming', 'mobile_van');

  SELECT COALESCE(jsonb_agg(jsonb_build_object('start_at', b.start_at, 'end_at', b.end_at, 'resource_id', b.resource_id)), '[]'::jsonb)
  INTO v_busy
  FROM public.bookings b
  WHERE b.tenant_id = p_tenant_id
    AND b.service_type::text IN ('grooming_inhouse', 'grooming_mobile')
    AND b.status::text NOT IN ('cancelled', 'no_show')
    AND b.start_at >= (p_day::timestamp AT TIME ZONE 'Africa/Johannesburg')
    AND b.start_at < ((p_day + 1)::timestamp AT TIME ZONE 'Africa/Johannesburg');

  RETURN jsonb_build_object('pool', v_pool, 'busy', v_busy);
END;
$$;

REVOKE ALL ON FUNCTION public.grooming_day_availability(uuid, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.grooming_day_availability(uuid, date) TO authenticated;