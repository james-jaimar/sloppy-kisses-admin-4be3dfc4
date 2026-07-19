
CREATE UNIQUE INDEX IF NOT EXISTS customers_tenant_email_unique
  ON public.customers (tenant_id, lower(email))
  WHERE email IS NOT NULL;
