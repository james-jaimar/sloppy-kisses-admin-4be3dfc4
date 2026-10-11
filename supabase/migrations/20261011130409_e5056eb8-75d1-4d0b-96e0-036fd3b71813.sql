CREATE TABLE public.grooming_boutique_styles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  image_path text,
  selections jsonb NOT NULL DEFAULT '{}'::jsonb,
  medical_flags text[] NOT NULL DEFAULT '{}',
  notes text,
  active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 100,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.grooming_boutique_styles TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.grooming_boutique_styles TO authenticated;
GRANT ALL ON public.grooming_boutique_styles TO service_role;
ALTER TABLE public.grooming_boutique_styles ENABLE ROW LEVEL SECURITY;
CREATE POLICY gbs_public_read ON public.grooming_boutique_styles FOR SELECT TO anon, authenticated USING (active = true);
CREATE POLICY gbs_staff_read ON public.grooming_boutique_styles FOR SELECT TO authenticated USING (public.user_has_tenant_access(tenant_id));
CREATE POLICY gbs_manage ON public.grooming_boutique_styles FOR ALL TO authenticated
  USING (public.user_has_permission(tenant_id, 'settings.grooming.manage'))
  WITH CHECK (public.user_has_permission(tenant_id, 'settings.grooming.manage'));
CREATE TRIGGER gbs_updated_at BEFORE UPDATE ON public.grooming_boutique_styles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.pet_grooming_defaults
  ADD COLUMN IF NOT EXISTS style_id uuid REFERENCES public.grooming_boutique_styles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reference_photo_path text;
ALTER TABLE public.grooming_booking_instructions
  ADD COLUMN IF NOT EXISTS style_id uuid REFERENCES public.grooming_boutique_styles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reference_photo_path text;

CREATE POLICY "grooming refs upload" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'grooming-references' AND (
    public.user_has_tenant_access(((storage.foldername(name))[1])::uuid)
    OR ((storage.foldername(name))[1])::uuid IN (SELECT c.tenant_id FROM public.customers c WHERE c.linked_profile_id = public.current_profile_id())
  ));
CREATE POLICY "grooming refs delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'grooming-references' AND public.user_has_tenant_access(((storage.foldername(name))[1])::uuid));