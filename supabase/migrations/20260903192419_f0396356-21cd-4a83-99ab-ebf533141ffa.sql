ALTER TABLE public.xero_import_customers
  ALTER COLUMN tenant_id SET DEFAULT '75cc6a9e-9d17-4268-92ee-8b595c842dee'::uuid,
  ALTER COLUMN batch SET DEFAULT 'xero-cleanup-2026-09-03',
  ADD COLUMN IF NOT EXISTS mobile_clean text,
  ADD COLUMN IF NOT EXISTS decision text NOT NULL DEFAULT 'import',
  ADD COLUMN IF NOT EXISTS merge_into_customer_no text;

ALTER TABLE public.xero_import_pets
  ALTER COLUMN tenant_id SET DEFAULT '75cc6a9e-9d17-4268-92ee-8b595c842dee'::uuid,
  ALTER COLUMN batch SET DEFAULT 'xero-cleanup-2026-09-03',
  ADD COLUMN IF NOT EXISTS species_clean text;

ALTER TABLE public.xero_import_addresses
  ALTER COLUMN tenant_id SET DEFAULT '75cc6a9e-9d17-4268-92ee-8b595c842dee'::uuid,
  ALTER COLUMN batch SET DEFAULT 'xero-cleanup-2026-09-03';