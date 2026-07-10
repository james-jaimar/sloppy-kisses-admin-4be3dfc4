
DROP VIEW IF EXISTS public.email_transport_settings_safe;
CREATE VIEW public.email_transport_settings_safe
  WITH (security_invoker = true) AS
SELECT
  tenant_id, provider, smtp_host, smtp_port, smtp_secure, smtp_username,
  from_name, from_email, reply_to, last_test_at, last_test_ok, last_test_error,
  (smtp_password IS NOT NULL AND length(smtp_password) > 0) AS has_password,
  created_at, updated_at
FROM public.email_transport_settings;

GRANT SELECT ON public.email_transport_settings_safe TO authenticated;
GRANT SELECT ON public.email_transport_settings_safe TO service_role;
