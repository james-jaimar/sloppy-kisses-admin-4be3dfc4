ALTER TABLE public.policy_settings
  ADD COLUMN IF NOT EXISTS hide_customer_phone_from_staff boolean NOT NULL DEFAULT false;

INSERT INTO public.permissions (code, label, description)
VALUES ('customers.contact.view', 'See customer phone numbers', 'View and call customer phone numbers when contact details are hidden from staff')
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
CROSS JOIN public.permissions p
WHERE p.code = 'customers.contact.view'
  AND r.code IN ('platform_owner','tenant_owner','tenant_admin','staff_frontdesk','staff_accounts')
ON CONFLICT DO NOTHING;