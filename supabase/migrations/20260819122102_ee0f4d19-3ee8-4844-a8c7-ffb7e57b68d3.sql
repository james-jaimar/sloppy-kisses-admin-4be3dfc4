
CREATE TABLE public.daycare_day_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  pet_id uuid NOT NULL REFERENCES public.pets(id) ON DELETE CASCADE,
  customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  note_date date NOT NULL DEFAULT (now() AT TIME ZONE 'Africa/Johannesburg')::date,
  body text NOT NULL,
  office_flag boolean NOT NULL DEFAULT false,
  handled_at timestamptz,
  handled_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  author_profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.daycare_day_notes TO authenticated;
GRANT ALL ON public.daycare_day_notes TO service_role;

ALTER TABLE public.daycare_day_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "daycare notes readable by tenant staff"
  ON public.daycare_day_notes FOR SELECT
  TO authenticated
  USING (user_has_tenant_access(tenant_id));

CREATE POLICY "daycare notes added by staff"
  ON public.daycare_day_notes FOR INSERT
  TO authenticated
  WITH CHECK (user_has_permission(tenant_id, 'daycare.notes') OR is_platform_owner());

CREATE POLICY "daycare notes updated by staff"
  ON public.daycare_day_notes FOR UPDATE
  TO authenticated
  USING (user_has_permission(tenant_id, 'daycare.notes') OR is_platform_owner())
  WITH CHECK (user_has_permission(tenant_id, 'daycare.notes') OR is_platform_owner());

CREATE POLICY "daycare notes deleted by admins"
  ON public.daycare_day_notes FOR DELETE
  TO authenticated
  USING (user_has_permission(tenant_id, 'settings.manage') OR is_platform_owner());

CREATE INDEX daycare_day_notes_day_idx ON public.daycare_day_notes (tenant_id, note_date);
CREATE INDEX daycare_day_notes_pet_idx ON public.daycare_day_notes (pet_id, note_date DESC);
CREATE INDEX daycare_day_notes_open_idx ON public.daycare_day_notes (tenant_id, office_flag, handled_at);

CREATE TRIGGER daycare_day_notes_updated_at
  BEFORE UPDATE ON public.daycare_day_notes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.permissions (code, label, description)
VALUES ('daycare.notes', 'Add daycare notes', 'Add day notes and flag them for the office')
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r, public.permissions p
WHERE r.code = 'staff_daycare' AND p.code = 'daycare.notes'
ON CONFLICT DO NOTHING;

DELETE FROM public.role_permissions rp
USING public.roles r, public.permissions p
WHERE rp.role_id = r.id AND rp.permission_id = p.id
  AND r.code = 'staff_daycare'
  AND p.code IN ('reports.view', 'bookings.view', 'documents.view', 'daycare.manage');
