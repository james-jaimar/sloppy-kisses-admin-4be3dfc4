
-- 1. Email transport settings
CREATE TABLE public.email_transport_settings (
  tenant_id uuid PRIMARY KEY REFERENCES public.tenants(id) ON DELETE CASCADE,
  provider text NOT NULL DEFAULT 'smtp',
  smtp_host text,
  smtp_port integer,
  smtp_secure text NOT NULL DEFAULT 'starttls', -- 'ssl' | 'starttls' | 'none'
  smtp_username text,
  smtp_password text, -- server-only; excluded from grants below
  from_name text,
  from_email text,
  reply_to text,
  last_test_at timestamptz,
  last_test_ok boolean,
  last_test_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Column-level grants: authenticated can SELECT everything EXCEPT smtp_password.
GRANT SELECT (tenant_id, provider, smtp_host, smtp_port, smtp_secure, smtp_username,
              from_name, from_email, reply_to, last_test_at, last_test_ok, last_test_error,
              created_at, updated_at)
  ON public.email_transport_settings TO authenticated;
GRANT ALL ON public.email_transport_settings TO service_role;

ALTER TABLE public.email_transport_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff with email perm can read settings"
  ON public.email_transport_settings FOR SELECT TO authenticated
  USING (public.user_has_permission(tenant_id, 'settings.email.manage'));

-- No INSERT/UPDATE/DELETE policies for authenticated — writes go through the
-- email-settings-save edge function using the service role.

-- Safe view (masks password presence)
CREATE OR REPLACE VIEW public.email_transport_settings_safe AS
SELECT
  tenant_id, provider, smtp_host, smtp_port, smtp_secure, smtp_username,
  from_name, from_email, reply_to, last_test_at, last_test_ok, last_test_error,
  (smtp_password IS NOT NULL AND length(smtp_password) > 0) AS has_password,
  created_at, updated_at
FROM public.email_transport_settings;

GRANT SELECT ON public.email_transport_settings_safe TO authenticated;
GRANT SELECT ON public.email_transport_settings_safe TO service_role;

CREATE TRIGGER trg_email_transport_settings_updated
  BEFORE UPDATE ON public.email_transport_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 2. Branding columns on tenants
ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS logo_dark_url text,
  ADD COLUMN IF NOT EXISTS accent_colour text,
  ADD COLUMN IF NOT EXISTS favicon_url text;

-- 3. New permission codes + grant to owner/manager roles
INSERT INTO public.permissions (code, label, description)
VALUES
  ('settings.email.manage',   'Manage email server', 'Configure SMTP / outbound email transport'),
  ('settings.branding.manage','Manage branding',      'Upload logo, set colours and favicon')
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
CROSS JOIN public.permissions p
WHERE r.code IN ('owner','manager')
  AND p.code IN ('settings.email.manage','settings.branding.manage')
ON CONFLICT DO NOTHING;
