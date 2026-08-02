ALTER TYPE public.email_status ADD VALUE IF NOT EXISTS 'blocked';
ALTER TYPE public.notification_status ADD VALUE IF NOT EXISTS 'blocked';

ALTER TABLE public.comms_settings
  ADD COLUMN IF NOT EXISTS sending_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS test_recipient_allowlist text[] NOT NULL DEFAULT '{}'::text[];

COMMENT ON COLUMN public.comms_settings.sending_enabled IS
  'Global outbound email kill switch. When false, only addresses in test_recipient_allowlist receive mail.';
COMMENT ON COLUMN public.comms_settings.test_recipient_allowlist IS
  'Lowercased email addresses that always receive mail, even while sending_enabled is false.';

INSERT INTO public.permissions(code, label, description)
VALUES ('comms.sending.toggle', 'Toggle outbound email lock',
        'Turn the global outbound email lock on or off')
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.role_permissions(role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
CROSS JOIN public.permissions p
WHERE p.code = 'comms.sending.toggle'
  AND lower(r.code) IN ('admin', 'owner', 'administrator')
ON CONFLICT DO NOTHING;