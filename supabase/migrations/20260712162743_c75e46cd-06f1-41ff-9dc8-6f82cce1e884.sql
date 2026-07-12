ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS provider text NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS pf_payment_id text,
  ADD COLUMN IF NOT EXISTS provider_mode text,
  ADD COLUMN IF NOT EXISTS provider_payload jsonb;

CREATE UNIQUE INDEX IF NOT EXISTS payments_pf_payment_id_unique
  ON public.payments(pf_payment_id)
  WHERE pf_payment_id IS NOT NULL;