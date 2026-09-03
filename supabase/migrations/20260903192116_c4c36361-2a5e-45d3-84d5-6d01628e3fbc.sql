CREATE TABLE IF NOT EXISTS public.xero_import_customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  batch text NOT NULL,
  customer_no text NOT NULL,
  first_name text,
  last_name text,
  full_name text,
  email text,
  mobile_raw text,
  alt_phone text,
  address_line1 text,
  address_line2 text,
  suburb text,
  city text,
  province text,
  postcode text,
  internal_notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.xero_import_pets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  batch text NOT NULL,
  pet_no text NOT NULL,
  customer_no text NOT NULL,
  pet_name text,
  species text,
  breed text,
  behaviour_notes text,
  special_handling boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.xero_import_addresses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  batch text NOT NULL,
  customer_no text NOT NULL,
  label text,
  line1 text,
  line2 text,
  suburb text,
  city text,
  province text,
  postcode text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.xero_import_customers TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.xero_import_pets TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.xero_import_addresses TO authenticated;
GRANT ALL ON public.xero_import_customers TO service_role;
GRANT ALL ON public.xero_import_pets TO service_role;
GRANT ALL ON public.xero_import_addresses TO service_role;

ALTER TABLE public.xero_import_customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.xero_import_pets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.xero_import_addresses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage xero import customers" ON public.xero_import_customers
  FOR ALL TO authenticated
  USING (public.user_has_permission(tenant_id, 'settings.manage'))
  WITH CHECK (public.user_has_permission(tenant_id, 'settings.manage'));

CREATE POLICY "Admins manage xero import pets" ON public.xero_import_pets
  FOR ALL TO authenticated
  USING (public.user_has_permission(tenant_id, 'settings.manage'))
  WITH CHECK (public.user_has_permission(tenant_id, 'settings.manage'));

CREATE POLICY "Admins manage xero import addresses" ON public.xero_import_addresses
  FOR ALL TO authenticated
  USING (public.user_has_permission(tenant_id, 'settings.manage'))
  WITH CHECK (public.user_has_permission(tenant_id, 'settings.manage'));