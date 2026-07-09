-- Platform-owner feature flags (only visible to platform users)
CREATE TABLE public.platform_flags (
  key text PRIMARY KEY,
  description text,
  enabled boolean NOT NULL DEFAULT false,
  value jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.platform_flags TO authenticated;
GRANT ALL ON public.platform_flags TO service_role;

ALTER TABLE public.platform_flags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Platform owners can read flags"
  ON public.platform_flags FOR SELECT
  TO authenticated
  USING (public.is_platform_owner());

CREATE POLICY "Platform owners can write flags"
  ON public.platform_flags FOR ALL
  TO authenticated
  USING (public.is_platform_owner())
  WITH CHECK (public.is_platform_owner());

CREATE TRIGGER platform_flags_touch_updated_at
  BEFORE UPDATE ON public.platform_flags
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Lightweight audit trail for platform-owner actions (tenant switches, flag toggles, impersonation etc.)
CREATE TABLE public.platform_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE SET NULL,
  action text NOT NULL,
  target text,
  payload jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.platform_audit TO authenticated;
GRANT ALL ON public.platform_audit TO service_role;

ALTER TABLE public.platform_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Platform owners can read audit"
  ON public.platform_audit FOR SELECT
  TO authenticated
  USING (public.is_platform_owner());

CREATE POLICY "Platform owners can insert audit"
  ON public.platform_audit FOR INSERT
  TO authenticated
  WITH CHECK (public.is_platform_owner());
