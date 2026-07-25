-- 1. Add addon_code column
ALTER TABLE public.grooming_instruction_options
  ADD COLUMN IF NOT EXISTS addon_code text;

-- 2. Deactivate duplicates
UPDATE public.grooming_addons SET active = false WHERE code IN ('nail_trim', 'mobile_travel');

-- 3. Seed missing shampoo upgrade add-ons per tenant that has grooming addons
INSERT INTO public.grooming_addons (tenant_id, code, name, price_zar, kind, active, sort_order)
SELECT DISTINCT tenant_id, 'shampoo_deshed', 'De-shedding shampoo & conditioner', 80, 'shampoo_upgrade', true, 20
FROM public.grooming_addons
WHERE NOT EXISTS (
  SELECT 1 FROM public.grooming_addons a2
  WHERE a2.tenant_id = public.grooming_addons.tenant_id AND a2.code = 'shampoo_deshed'
);

INSERT INTO public.grooming_addons (tenant_id, code, name, price_zar, kind, active, sort_order)
SELECT DISTINCT tenant_id, 'shampoo_whitening', 'Purple/Whitening shampoo & conditioner', 80, 'shampoo_upgrade', true, 21
FROM public.grooming_addons
WHERE NOT EXISTS (
  SELECT 1 FROM public.grooming_addons a2
  WHERE a2.tenant_id = public.grooming_addons.tenant_id AND a2.code = 'shampoo_whitening'
);

-- 4. Link existing instruction options to matching addon_code
UPDATE public.grooming_instruction_options o
SET addon_code = 'shampoo_tick_flea'
FROM public.grooming_instruction_groups g
WHERE o.group_id = g.id AND g.code = 'shampoo' AND o.code = 'tick_flea';

UPDATE public.grooming_instruction_options o
SET addon_code = 'shampoo_hypo'
FROM public.grooming_instruction_groups g
WHERE o.group_id = g.id AND g.code = 'shampoo' AND o.code = 'hypoallergenic';

UPDATE public.grooming_instruction_options o
SET addon_code = 'shampoo_deshed'
FROM public.grooming_instruction_groups g
WHERE o.group_id = g.id AND g.code = 'shampoo' AND o.code = 'deshedding';

UPDATE public.grooming_instruction_options o
SET addon_code = 'shampoo_whitening'
FROM public.grooming_instruction_groups g
WHERE o.group_id = g.id AND g.code = 'shampoo' AND o.code = 'purple';

UPDATE public.grooming_instruction_options o
SET addon_code = 'teeth_toothpaste'
FROM public.grooming_instruction_groups g
WHERE o.group_id = g.id AND g.code = 'teeth' AND o.code IN ('toothbrush_purchased','toothbrush_provided');

UPDATE public.grooming_instruction_options o
SET addon_code = 'ear_clean'
FROM public.grooming_instruction_groups g
WHERE o.group_id = g.id AND g.code = 'ears' AND o.code = 'clean';

-- 5. Seed Nails instruction group + options per tenant
INSERT INTO public.grooming_instruction_groups (tenant_id, code, label, kind, sort_order, active, is_medical)
SELECT DISTINCT tenant_id, 'nails', 'Nails', 'single', 80, true, false
FROM public.grooming_instruction_groups
WHERE NOT EXISTS (
  SELECT 1 FROM public.grooming_instruction_groups g2
  WHERE g2.tenant_id = public.grooming_instruction_groups.tenant_id AND g2.code = 'nails'
);

INSERT INTO public.grooming_instruction_options (tenant_id, group_id, code, label, sort_order, active, is_alert, addon_code)
SELECT g.tenant_id, g.id, v.code, v.label, v.sort_order, true, false, v.addon_code
FROM public.grooming_instruction_groups g
CROSS JOIN (VALUES
  ('none','No trim',1,NULL::text),
  ('trim','Trim (+add-on)',2,'nails_trim')
) AS v(code,label,sort_order,addon_code)
WHERE g.code = 'nails'
  AND NOT EXISTS (
    SELECT 1 FROM public.grooming_instruction_options o WHERE o.group_id = g.id AND o.code = v.code
  );

-- 6. Seed Anal glands instruction group + options
INSERT INTO public.grooming_instruction_groups (tenant_id, code, label, kind, sort_order, active, is_medical)
SELECT DISTINCT tenant_id, 'anal_glands', 'Anal glands', 'single', 85, true, false
FROM public.grooming_instruction_groups
WHERE NOT EXISTS (
  SELECT 1 FROM public.grooming_instruction_groups g2
  WHERE g2.tenant_id = public.grooming_instruction_groups.tenant_id AND g2.code = 'anal_glands'
);

INSERT INTO public.grooming_instruction_options (tenant_id, group_id, code, label, sort_order, active, is_alert, addon_code)
SELECT g.tenant_id, g.id, v.code, v.label, v.sort_order, true, false, v.addon_code
FROM public.grooming_instruction_groups g
CROSS JOIN (VALUES
  ('none','No expression',1,NULL::text),
  ('express','Express (+add-on)',2,'anal_gland')
) AS v(code,label,sort_order,addon_code)
WHERE g.code = 'anal_glands'
  AND NOT EXISTS (
    SELECT 1 FROM public.grooming_instruction_options o WHERE o.group_id = g.id AND o.code = v.code
  );

-- 7. Seed Hand stripping instruction group (bool)
INSERT INTO public.grooming_instruction_groups (tenant_id, code, label, kind, sort_order, active, is_medical)
SELECT DISTINCT tenant_id, 'hand_strip', 'Hand stripping', 'bool', 90, true, false
FROM public.grooming_instruction_groups
WHERE NOT EXISTS (
  SELECT 1 FROM public.grooming_instruction_groups g2
  WHERE g2.tenant_id = public.grooming_instruction_groups.tenant_id AND g2.code = 'hand_strip'
);

-- Note: bool groups have no options row; UI reads the boolean value directly.
-- Hand-strip addon auto-add is handled in UI by group code.