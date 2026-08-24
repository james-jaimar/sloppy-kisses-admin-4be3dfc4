DELETE FROM public.role_permissions rp
USING public.roles r, public.permissions p
WHERE rp.role_id = r.id
  AND rp.permission_id = p.id
  AND r.code = 'staff_shop'
  AND p.code NOT IN ('pos.operate','products.view','products.photos','stock.view','pos.barcode.link');

INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
JOIN public.permissions p ON p.code IN ('pos.operate','products.view','products.photos','stock.view','pos.barcode.link')
WHERE r.code = 'staff_shop'
ON CONFLICT DO NOTHING;