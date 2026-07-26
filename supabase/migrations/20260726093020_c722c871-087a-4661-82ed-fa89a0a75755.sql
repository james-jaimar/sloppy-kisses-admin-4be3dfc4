ALTER TABLE public.policy_settings ADD COLUMN IF NOT EXISTS consent_grace_days integer NOT NULL DEFAULT 30;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS consent_prompted_at timestamptz;