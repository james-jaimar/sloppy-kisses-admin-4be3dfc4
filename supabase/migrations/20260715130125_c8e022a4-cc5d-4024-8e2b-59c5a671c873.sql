
-- 1. Customer comms channel prefs + signup status
ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS notify_sms boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS notify_whatsapp boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS signup_status text NOT NULL DEFAULT 'active';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'customers_signup_status_check'
  ) THEN
    ALTER TABLE public.customers
      ADD CONSTRAINT customers_signup_status_check
      CHECK (signup_status IN ('active','pending_review','disabled'));
  END IF;
END $$;

-- 2. Notification event types for portal lifecycle
ALTER TYPE public.notification_event_type ADD VALUE IF NOT EXISTS 'customer_signup_pending';
ALTER TYPE public.notification_event_type ADD VALUE IF NOT EXISTS 'portal_invited';
ALTER TYPE public.notification_event_type ADD VALUE IF NOT EXISTS 'password_reset_requested';
ALTER TYPE public.notification_event_type ADD VALUE IF NOT EXISTS 'booking_cancellation_requested';

-- 3. New permission codes
INSERT INTO public.permissions (code, label, description) VALUES
  ('customers.portal.manage',      'Manage customer portal access', 'Invite, disable, unlink and reset customer portal accounts'),
  ('customers.portal.impersonate', 'Impersonate customer',          'View the portal as a customer (read-only)')
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
CROSS JOIN public.permissions p
WHERE r.code IN ('platform_owner','tenant_owner','tenant_admin')
  AND p.code IN ('customers.portal.manage','customers.portal.impersonate')
ON CONFLICT DO NOTHING;
