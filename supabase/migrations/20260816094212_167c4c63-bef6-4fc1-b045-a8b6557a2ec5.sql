DELETE FROM public.role_permissions rp
USING public.roles r, public.permissions p
WHERE rp.role_id = r.id AND rp.permission_id = p.id
  AND r.code = 'staff_groomer_mobile' AND p.code = 'work.transport';

CREATE TABLE public.resource_staff (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  resource_id uuid NOT NULL REFERENCES public.resources(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (resource_id, profile_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.resource_staff TO authenticated;
GRANT ALL ON public.resource_staff TO service_role;

ALTER TABLE public.resource_staff ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant staff can view resource staff"
ON public.resource_staff FOR SELECT TO authenticated
USING (public.user_has_tenant_access(tenant_id));

CREATE POLICY "Managers can manage resource staff"
ON public.resource_staff FOR ALL TO authenticated
USING (public.user_has_permission(tenant_id, 'settings.manage') OR public.user_has_permission(tenant_id, 'users.manage'))
WITH CHECK (public.user_has_permission(tenant_id, 'settings.manage') OR public.user_has_permission(tenant_id, 'users.manage'));

CREATE TRIGGER update_resource_staff_updated_at
BEFORE UPDATE ON public.resource_staff
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX idx_resource_staff_profile ON public.resource_staff (profile_id);
CREATE INDEX idx_resource_staff_tenant ON public.resource_staff (tenant_id);