INSERT INTO public.permissions (code, label, description)
SELECT 'work.grooming_mobile', 'Work mode: mobile grooming', 'Use work mode for mobile van grooming jobs and routes'
WHERE NOT EXISTS (SELECT 1 FROM public.permissions WHERE code = 'work.grooming_mobile');

INSERT INTO public.roles (tenant_id, code, label, description, is_system_role)
SELECT t.id, 'staff_groomer_mobile', 'Mobile Groomer', 'Mobile van groomer: today''s route and jobs on a phone', false
FROM public.tenants t
WHERE NOT EXISTS (
  SELECT 1 FROM public.roles r WHERE r.tenant_id = t.id AND r.code = 'staff_groomer_mobile'
);

INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
JOIN public.permissions p ON p.code IN (
  'work.access','work.grooming_mobile','work.signoff','work.transport',
  'incidents.raise','bookings.view','bookings.update','customers.view','pets.view','documents.view'
)
WHERE r.code = 'staff_groomer_mobile'
  AND NOT EXISTS (
    SELECT 1 FROM public.role_permissions rp WHERE rp.role_id = r.id AND rp.permission_id = p.id
  );

DELETE FROM public.role_permissions rp
USING public.roles r, public.permissions p
WHERE rp.role_id = r.id
  AND rp.permission_id = p.id
  AND r.code = 'staff_grooming'
  AND p.code = 'transport.view';