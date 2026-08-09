ALTER TABLE public.customer_addresses
  ADD COLUMN IF NOT EXISTS verification_failed_at timestamptz,
  ADD COLUMN IF NOT EXISTS verification_error text;

CREATE INDEX IF NOT EXISTS customer_addresses_unverified_idx
  ON public.customer_addresses (tenant_id)
  WHERE google_place_id IS NULL;