
-- 1) Permission
INSERT INTO public.permissions (code, label, description)
VALUES ('settings.vans.manage', 'Manage mobile van settings', 'Edit mobile van workflow rules (travel gap warnings, working hours, per-van home suburb)')
ON CONFLICT (code) DO NOTHING;

-- 2) Table
CREATE TABLE IF NOT EXISTS public.van_workflow_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  min_travel_gap_minutes integer NOT NULL DEFAULT 15 CHECK (min_travel_gap_minutes >= 0),
  max_travel_gap_minutes integer NOT NULL DEFAULT 90 CHECK (max_travel_gap_minutes >= 0),
  day_start_time time NOT NULL DEFAULT '08:00',
  day_end_time time NOT NULL DEFAULT '17:00',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id)
);

-- 3) Grants
GRANT SELECT, INSERT, UPDATE, DELETE ON public.van_workflow_settings TO authenticated;
GRANT ALL ON public.van_workflow_settings TO service_role;

-- 4) RLS
ALTER TABLE public.van_workflow_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "van_workflow_settings_select" ON public.van_workflow_settings
  FOR SELECT TO authenticated
  USING (public.user_has_tenant_access(tenant_id));

CREATE POLICY "van_workflow_settings_insert" ON public.van_workflow_settings
  FOR INSERT TO authenticated
  WITH CHECK (public.user_has_permission(tenant_id, 'settings.vans.manage'));

CREATE POLICY "van_workflow_settings_update" ON public.van_workflow_settings
  FOR UPDATE TO authenticated
  USING (public.user_has_permission(tenant_id, 'settings.vans.manage'))
  WITH CHECK (public.user_has_permission(tenant_id, 'settings.vans.manage'));

CREATE POLICY "van_workflow_settings_delete" ON public.van_workflow_settings
  FOR DELETE TO authenticated
  USING (public.user_has_permission(tenant_id, 'settings.vans.manage'));

-- 5) updated_at trigger
CREATE TRIGGER trg_van_workflow_settings_updated_at
  BEFORE UPDATE ON public.van_workflow_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 6) Seed default row for existing tenants (idempotent)
INSERT INTO public.van_workflow_settings (tenant_id)
SELECT id FROM public.tenants
ON CONFLICT (tenant_id) DO NOTHING;

-- 7) Grant the new permission to any role that already has settings.hotel.manage
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT DISTINCT rp.role_id, new_perm.id
FROM public.role_permissions rp
JOIN public.permissions existing ON existing.id = rp.permission_id AND existing.code = 'settings.hotel.manage'
CROSS JOIN LATERAL (SELECT id FROM public.permissions WHERE code = 'settings.vans.manage') AS new_perm
ON CONFLICT DO NOTHING;

-- 8) Per-resource home suburb (used for mobile vans; harmless on other resource types)
ALTER TABLE public.resources
  ADD COLUMN IF NOT EXISTS home_suburb text;
