
-- 1) Permission
INSERT INTO public.permissions (code, label, description)
VALUES ('settings.hotel.manage', 'Manage hotel & cattery settings', 'Edit hotel workflow rules (vaccination gate, check-in/out windows, late fees)')
ON CONFLICT (code) DO NOTHING;

-- 2) Table
CREATE TABLE IF NOT EXISTS public.hotel_workflow_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  vax_gate_mode text NOT NULL DEFAULT 'soft' CHECK (vax_gate_mode IN ('soft','hard','off')),
  check_in_open_time time NOT NULL DEFAULT '08:00',
  check_in_close_time time NOT NULL DEFAULT '18:00',
  check_out_by_time time NOT NULL DEFAULT '11:00',
  late_checkout_fee_zar numeric(10,2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id)
);

-- 3) Grants
GRANT SELECT, INSERT, UPDATE, DELETE ON public.hotel_workflow_settings TO authenticated;
GRANT ALL ON public.hotel_workflow_settings TO service_role;

-- 4) RLS
ALTER TABLE public.hotel_workflow_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "hotel_workflow_settings_select" ON public.hotel_workflow_settings
  FOR SELECT TO authenticated
  USING (public.user_has_tenant_access(tenant_id));

CREATE POLICY "hotel_workflow_settings_insert" ON public.hotel_workflow_settings
  FOR INSERT TO authenticated
  WITH CHECK (public.user_has_permission(tenant_id, 'settings.hotel.manage'));

CREATE POLICY "hotel_workflow_settings_update" ON public.hotel_workflow_settings
  FOR UPDATE TO authenticated
  USING (public.user_has_permission(tenant_id, 'settings.hotel.manage'))
  WITH CHECK (public.user_has_permission(tenant_id, 'settings.hotel.manage'));

CREATE POLICY "hotel_workflow_settings_delete" ON public.hotel_workflow_settings
  FOR DELETE TO authenticated
  USING (public.user_has_permission(tenant_id, 'settings.hotel.manage'));

-- 5) updated_at trigger
CREATE TRIGGER trg_hotel_workflow_settings_updated_at
  BEFORE UPDATE ON public.hotel_workflow_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 6) Seed default row for existing tenants (idempotent)
INSERT INTO public.hotel_workflow_settings (tenant_id)
SELECT id FROM public.tenants
ON CONFLICT (tenant_id) DO NOTHING;

-- 7) Grant the new permission to any role that already has settings.grooming.manage
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT DISTINCT rp.role_id, new_perm.id
FROM public.role_permissions rp
JOIN public.permissions existing ON existing.id = rp.permission_id AND existing.code = 'settings.grooming.manage'
CROSS JOIN LATERAL (SELECT id FROM public.permissions WHERE code = 'settings.hotel.manage') AS new_perm
ON CONFLICT DO NOTHING;
