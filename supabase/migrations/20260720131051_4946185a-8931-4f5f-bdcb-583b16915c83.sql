
CREATE TABLE public.customer_notes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  author_profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  body TEXT NOT NULL CHECK (length(trim(body)) > 0),
  pinned BOOLEAN NOT NULL DEFAULT false,
  alert BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX customer_notes_customer_idx ON public.customer_notes (customer_id, pinned DESC, created_at DESC);
CREATE INDEX customer_notes_tenant_pinned_idx ON public.customer_notes (tenant_id, pinned) WHERE pinned = true;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.customer_notes TO authenticated;
GRANT ALL ON public.customer_notes TO service_role;

ALTER TABLE public.customer_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view customer notes"
  ON public.customer_notes FOR SELECT
  TO authenticated
  USING (
    public.user_has_permission(tenant_id, 'customers.view')
    OR public.is_platform_owner()
  );

CREATE POLICY "Staff can add customer notes"
  ON public.customer_notes FOR INSERT
  TO authenticated
  WITH CHECK (
    public.user_has_permission(tenant_id, 'customers.edit')
    OR public.is_platform_owner()
  );

CREATE POLICY "Staff can edit customer notes"
  ON public.customer_notes FOR UPDATE
  TO authenticated
  USING (
    public.user_has_permission(tenant_id, 'customers.edit')
    OR public.is_platform_owner()
  )
  WITH CHECK (
    public.user_has_permission(tenant_id, 'customers.edit')
    OR public.is_platform_owner()
  );

CREATE POLICY "Staff can delete customer notes"
  ON public.customer_notes FOR DELETE
  TO authenticated
  USING (
    public.user_has_permission(tenant_id, 'customers.edit')
    OR public.is_platform_owner()
  );

CREATE TRIGGER customer_notes_set_updated_at
  BEFORE UPDATE ON public.customer_notes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
