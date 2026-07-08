-- Permission
INSERT INTO public.permissions (code, label, description)
VALUES ('settings.daycare.manage', 'Manage daycare settings', 'Manage daycare plans and workflow settings')
ON CONFLICT (code) DO NOTHING;

-- Grant new permission to any role that already has vans or transport settings management
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT DISTINCT rp.role_id, p_new.id
FROM public.role_permissions rp
JOIN public.permissions p_src ON p_src.id = rp.permission_id
CROSS JOIN public.permissions p_new
WHERE p_src.code IN ('settings.vans.manage','settings.transport.manage')
  AND p_new.code = 'settings.daycare.manage'
ON CONFLICT DO NOTHING;

-- Table
CREATE TABLE public.daycare_workflow_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL UNIQUE REFERENCES public.tenants(id) ON DELETE CASCADE,
  arrival_window_start TIME NOT NULL DEFAULT '07:00',
  arrival_window_end TIME NOT NULL DEFAULT '09:30',
  late_arrival_cutoff TIME NOT NULL DEFAULT '10:00',
  auto_checkout_time TIME NOT NULL DEFAULT '18:00',
  block_unvaccinated BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.daycare_workflow_settings TO authenticated;
GRANT ALL ON public.daycare_workflow_settings TO service_role;

ALTER TABLE public.daycare_workflow_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant staff can view daycare workflow settings"
ON public.daycare_workflow_settings FOR SELECT TO authenticated
USING (public.user_has_tenant_access(tenant_id));

CREATE POLICY "Permitted users can insert daycare workflow settings"
ON public.daycare_workflow_settings FOR INSERT TO authenticated
WITH CHECK (public.user_has_permission(tenant_id, 'settings.daycare.manage'));

CREATE POLICY "Permitted users can update daycare workflow settings"
ON public.daycare_workflow_settings FOR UPDATE TO authenticated
USING (public.user_has_permission(tenant_id, 'settings.daycare.manage'))
WITH CHECK (public.user_has_permission(tenant_id, 'settings.daycare.manage'));

CREATE POLICY "Permitted users can delete daycare workflow settings"
ON public.daycare_workflow_settings FOR DELETE TO authenticated
USING (public.user_has_permission(tenant_id, 'settings.daycare.manage'));

CREATE TRIGGER trg_daycare_workflow_settings_updated_at
BEFORE UPDATE ON public.daycare_workflow_settings
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Seed default row per tenant
INSERT INTO public.daycare_workflow_settings (tenant_id)
SELECT t.id FROM public.tenants t
WHERE NOT EXISTS (
  SELECT 1 FROM public.daycare_workflow_settings s WHERE s.tenant_id = t.id
);