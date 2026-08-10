CREATE TABLE public.tenant_features (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  feature_key text NOT NULL,
  enabled boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  UNIQUE (tenant_id, feature_key)
);

GRANT SELECT ON public.tenant_features TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.tenant_features TO authenticated;
GRANT ALL ON public.tenant_features TO service_role;

ALTER TABLE public.tenant_features ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_features_select_members" ON public.tenant_features
FOR SELECT TO authenticated
USING (public.user_has_tenant_access(tenant_id));

CREATE POLICY "tenant_features_write_platform" ON public.tenant_features
FOR ALL TO authenticated
USING (public.is_platform_owner())
WITH CHECK (public.is_platform_owner());

INSERT INTO public.tenant_features (tenant_id, feature_key, enabled)
SELECT t.id, v.k, v.e
FROM public.tenants t
CROSS JOIN (VALUES ('integrations.xero', true), ('vans.route_optimisation', false)) AS v(k, e)
ON CONFLICT (tenant_id, feature_key) DO NOTHING;