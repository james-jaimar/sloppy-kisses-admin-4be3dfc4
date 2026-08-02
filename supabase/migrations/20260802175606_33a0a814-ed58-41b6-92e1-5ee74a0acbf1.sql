-- Front Desk role: remove screens the owner doesn't want front-of-house seeing
DELETE FROM public.role_permissions rp
USING public.permissions p
WHERE rp.permission_id = p.id
  AND rp.role_id = 'd2e3334b-b451-4322-84a8-fde08d7f82f7'
  AND (
    p.code IN ('calendar.view','calendar.manage','reports.view','credit_notes.view')
    OR p.code LIKE 'booking_requests.%'
  );

-- Front Desk role: add department management + comms + daycare check-in
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT 'd2e3334b-b451-4322-84a8-fde08d7f82f7', p.id
FROM public.permissions p
WHERE p.code IN (
  'daycare.manage','hotel.manage','grooming.manage','transport.manage',
  'daycare.checkin','comms.view','comms.send','customer_credit.view'
)
ON CONFLICT DO NOTHING;