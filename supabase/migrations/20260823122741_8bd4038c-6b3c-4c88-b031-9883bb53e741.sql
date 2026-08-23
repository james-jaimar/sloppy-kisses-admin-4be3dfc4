ALTER TABLE public.grooming_instruction_groups
  ADD COLUMN IF NOT EXISTS icon text,
  ADD COLUMN IF NOT EXISTS colour text;

UPDATE public.grooming_instruction_groups SET icon = v.icon, colour = v.colour
FROM (VALUES
  ('shampoo','droplet','turquoise'),
  ('head_face','smile','coral'),
  ('teeth','smile-plus','turquoise'),
  ('eyes','eye','coral'),
  ('eyebrows','eye','coral'),
  ('fringe','scissors','coral'),
  ('moustache','scissors','coral'),
  ('beard','scissors','coral'),
  ('nails','hand','orange'),
  ('ears','ear','coral'),
  ('hand_strip','brush','orange'),
  ('top_knot','scissors','coral'),
  ('body','dog','turquoise'),
  ('blade','ruler','muted'),
  ('aircon_strip','wind','turquoise'),
  ('legs','footprints','turquoise'),
  ('skirt','scissors','turquoise'),
  ('hygiene_cut','sparkles','green'),
  ('anal_glands','stethoscope','orange'),
  ('tail','scissors','turquoise'),
  ('feet','paw-print','green'),
  ('accessories','gift','green'),
  ('medical','shield-alert','danger'),
  ('special_instructions','message-square','muted'),
  ('other_notes','sticky-note','muted'),
  ('told_office_to_call','phone','orange')
) AS v(code, icon, colour)
WHERE grooming_instruction_groups.code = v.code
  AND (grooming_instruction_groups.icon IS NULL OR grooming_instruction_groups.colour IS NULL);

CREATE TABLE IF NOT EXISTS public.booking_brief_checks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  booking_id uuid NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  pet_id uuid REFERENCES public.pets(id) ON DELETE CASCADE,
  group_code text NOT NULL,
  done boolean NOT NULL DEFAULT false,
  done_by uuid,
  done_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS booking_brief_checks_unique
  ON public.booking_brief_checks (booking_id, COALESCE(pet_id, '00000000-0000-0000-0000-000000000000'::uuid), group_code);
CREATE INDEX IF NOT EXISTS booking_brief_checks_booking_idx ON public.booking_brief_checks (booking_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.booking_brief_checks TO authenticated;
GRANT ALL ON public.booking_brief_checks TO service_role;

ALTER TABLE public.booking_brief_checks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "brief checks readable by tenant staff"
  ON public.booking_brief_checks FOR SELECT TO authenticated
  USING (public.user_has_tenant_access(tenant_id));

CREATE POLICY "brief checks writable by booking updaters"
  ON public.booking_brief_checks FOR ALL TO authenticated
  USING (public.user_has_permission(tenant_id, 'bookings.update'))
  WITH CHECK (public.user_has_permission(tenant_id, 'bookings.update'));

CREATE TRIGGER update_booking_brief_checks_updated_at
  BEFORE UPDATE ON public.booking_brief_checks
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();