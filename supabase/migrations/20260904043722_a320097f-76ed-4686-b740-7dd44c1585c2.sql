INSERT INTO public.customer_addresses (
  tenant_id, customer_id, label, address_line_1, address_line_2,
  suburb, city, province, postcode, is_primary
)
SELECT s.tenant_id, c.id, COALESCE(a.label,'Home'), a.line1, a.line2,
       a.suburb, a.city, a.province, a.postcode, true
FROM public.xero_import_addresses a
JOIN public.xero_import_customers s
  ON s.customer_no = a.customer_no AND s.decision = 'merge'
JOIN public.customers c
  ON c.tenant_id = s.tenant_id AND c.customer_number = s.merge_into_customer_no
WHERE NOT EXISTS (
  SELECT 1 FROM public.customer_addresses ca WHERE ca.customer_id = c.id
);