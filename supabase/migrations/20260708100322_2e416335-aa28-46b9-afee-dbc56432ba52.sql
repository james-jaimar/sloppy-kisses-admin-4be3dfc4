
-- 1) Permission
INSERT INTO public.permissions (code, label, description)
VALUES ('settings.transport.manage', 'Manage transport settings', 'Edit pick-up / drop-off workflow rules (gap warnings, working hours, default lead time)')
ON CONFLICT (code) DO NOTHING;

-- 2) Table
CREATE TABLE IF NOT EXISTS public.transport_workflow_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  min_leg_gap_minutes integer NOT NULL DEFAULT 15 CHECK (min_leg_gap_minutes >= 0),
  max_leg_gap_minutes integer NOT NULL DEFAULT 120 CHECK (max_leg_gap_minutes >= 0),
  day_start_time time NOT NULL DEFAULT '07:00',
  day_end_time time NOT NULL DEFAULT '18:00',
  default_pickup_lead_minutes integer NOT NULL DEFAULT 30 CHECK (default_pickup_lead_minutes >= 0),
  default_dropoff_trail_minutes integer NOT NULL DEFAULT 15 CHECK (default_dropoff_trail_minutes >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id)
);

-- 3) Grants
GRANT SELECT, INSERT, UPDATE, DELETE ON public.transport_workflow_settings TO authenticated;
GRANT ALL ON public.transport_workflow_settings TO service_role;

-- 4) RLS
ALTER TABLE public.transport_workflow_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "transport_workflow_settings_select" ON public.transport_workflow_settings
  FOR SELECT TO authenticated
  USING (public.user_has_tenant_access(tenant_id));

CREATE POLICY "transport_workflow_settings_insert" ON public.transport_workflow_settings
  FOR INSERT TO authenticated
  WITH CHECK (public.user_has_permission(tenant_id, 'settings.transport.manage'));

CREATE POLICY "transport_workflow_settings_update" ON public.transport_workflow_settings
  FOR UPDATE TO authenticated
  USING (public.user_has_permission(tenant_id, 'settings.transport.manage'))
  WITH CHECK (public.user_has_permission(tenant_id, 'settings.transport.manage'));

CREATE POLICY "transport_workflow_settings_delete" ON public.transport_workflow_settings
  FOR DELETE TO authenticated
  USING (public.user_has_permission(tenant_id, 'settings.transport.manage'));

-- 5) updated_at trigger
CREATE TRIGGER trg_transport_workflow_settings_updated_at
  BEFORE UPDATE ON public.transport_workflow_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 6) Seed default row for existing tenants (idempotent)
INSERT INTO public.transport_workflow_settings (tenant_id)
SELECT id FROM public.tenants
ON CONFLICT (tenant_id) DO NOTHING;

-- 7) Grant the new permission to any role that already has settings.vans.manage
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT DISTINCT rp.role_id, new_perm.id
FROM public.role_permissions rp
JOIN public.permissions existing ON existing.id = rp.permission_id AND existing.code = 'settings.vans.manage'
CROSS JOIN LATERAL (SELECT id FROM public.permissions WHERE code = 'settings.transport.manage') AS new_perm
ON CONFLICT DO NOTHING;
