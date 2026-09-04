-- 1. Record the confirmed decisions
UPDATE public.xero_import_customers SET decision='skip'
 WHERE customer_no IN ('SK04435','SK04471','SK04563');

UPDATE public.xero_import_customers SET decision='merge', merge_into_customer_no = m.target
FROM (VALUES
  ('SK04463','SK02896'),('SK04562','SK03587'),('SK04608','SK01292'),
  ('SK04695','SK04385'),('SK04696','SK04390'),
  ('SK04683','SK04340'),('SK04684','SK04340')
) AS m(src,target)
WHERE xero_import_customers.customer_no = m.src;

-- Chantell Radda-Mini folds into the new Chantal Rodda-Mini record
UPDATE public.xero_import_customers
 SET decision='merge', merge_into_customer_no='SK04449'
 WHERE customer_no='SK04450';

-- 2. Create the new customers
INSERT INTO public.customers (
  tenant_id, customer_number, full_name, first_name, last_name, email, mobile, phone_alt,
  address_line_1, address_line_2, suburb, city, province, postcode, notes_internal, import_source
)
SELECT s.tenant_id, s.customer_no, s.full_name, s.first_name, s.last_name,
       s.email, s.mobile_clean, s.alt_phone,
       s.address_line1, s.address_line2, s.suburb, s.city, s.province, s.postcode,
       s.internal_notes, 'xero-cleanup-2026-09-03'
FROM public.xero_import_customers s
WHERE s.decision = 'import'
  AND NOT EXISTS (SELECT 1 FROM public.customers c
                  WHERE c.tenant_id = s.tenant_id AND c.customer_number = s.customer_no);

-- 3. Create the pets, routing merged rows to the surviving customer
WITH target AS (
  SELECT s.customer_no,
         COALESCE(s.merge_into_customer_no, s.customer_no) AS dest_no,
         s.tenant_id, s.decision
  FROM public.xero_import_customers s
)
INSERT INTO public.pets (
  tenant_id, customer_id, name, species, breed, behaviour_notes,
  special_handling_flag, pet_number, legacy_customer_number, import_source
)
SELECT t.tenant_id, c.id,
       COALESCE(NULLIF(btrim(p.pet_name),''), 'Unnamed ' || p.species_clean || ' (' || p.pet_no || ')'),
       p.species_clean::pet_species, p.breed, p.behaviour_notes,
       COALESCE(p.special_handling,false), p.pet_no, p.customer_no, 'xero-cleanup-2026-09-03'
FROM public.xero_import_pets p
JOIN target t ON t.customer_no = p.customer_no AND t.decision <> 'skip'
JOIN public.customers c ON c.tenant_id = t.tenant_id AND c.customer_number = t.dest_no
WHERE NOT EXISTS (
  SELECT 1 FROM public.pets ep WHERE ep.tenant_id = t.tenant_id AND ep.pet_number = p.pet_no
);

-- 4. Addresses for the newly created customers only
INSERT INTO public.customer_addresses (
  tenant_id, customer_id, label, address_line_1, address_line_2,
  suburb, city, province, postcode, is_primary
)
SELECT s.tenant_id, c.id, COALESCE(a.label,'Home'), a.line1, a.line2,
       a.suburb, a.city, a.province, a.postcode, true
FROM public.xero_import_addresses a
JOIN public.xero_import_customers s ON s.customer_no = a.customer_no AND s.decision = 'import'
JOIN public.customers c ON c.tenant_id = s.tenant_id AND c.customer_number = s.customer_no
WHERE NOT EXISTS (
  SELECT 1 FROM public.customer_addresses ca WHERE ca.customer_id = c.id
);