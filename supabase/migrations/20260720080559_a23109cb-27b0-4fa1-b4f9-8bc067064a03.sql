
INSERT INTO public.role_permissions(role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
CROSS JOIN public.permissions p
WHERE p.code IN (
    'daycare.enrolments.delete','daycare.plans.delete',
    'bookings.delete','customers.delete','pets.delete',
    'grooming.catalog.delete'
  )
  AND (r.is_system_role = true OR lower(coalesce(r.code, r.label)) IN ('owner','admin','administrator'))
ON CONFLICT DO NOTHING;
