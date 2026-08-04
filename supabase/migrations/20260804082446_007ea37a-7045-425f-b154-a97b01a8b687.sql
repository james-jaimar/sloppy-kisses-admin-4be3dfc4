
ALTER TABLE public.invoice_items ADD COLUMN IF NOT EXISTS item_code text;
ALTER TABLE public.credit_note_items ADD COLUMN IF NOT EXISTS item_code text;

CREATE TABLE public.billing_item_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  kind text NOT NULL,
  ref_key text NOT NULL,
  label text NOT NULL,
  code text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, kind, ref_key)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.billing_item_codes TO authenticated;
GRANT ALL ON public.billing_item_codes TO service_role;
ALTER TABLE public.billing_item_codes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "billing_item_codes_select" ON public.billing_item_codes
  FOR SELECT TO authenticated
  USING (public.is_platform_owner() OR public.user_has_permission(tenant_id, 'invoices.view'));

CREATE POLICY "billing_item_codes_write" ON public.billing_item_codes
  FOR ALL TO authenticated
  USING (public.is_platform_owner() OR public.user_has_permission(tenant_id, 'settings.xero.manage'))
  WITH CHECK (public.is_platform_owner() OR public.user_has_permission(tenant_id, 'settings.xero.manage'));

CREATE TRIGGER billing_item_codes_updated_at BEFORE UPDATE ON public.billing_item_codes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.xero_contacts_staging (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  xero_contact_id text NOT NULL,
  name text,
  first_name text,
  last_name text,
  email text,
  phone text,
  account_number text,
  contact_status text,
  matched_customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  match_type text,
  match_state text NOT NULL DEFAULT 'unmatched',
  pulled_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, xero_contact_id)
);

CREATE INDEX xero_contacts_staging_email_idx ON public.xero_contacts_staging (tenant_id, lower(email));
CREATE INDEX xero_contacts_staging_state_idx ON public.xero_contacts_staging (tenant_id, match_state);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.xero_contacts_staging TO authenticated;
GRANT ALL ON public.xero_contacts_staging TO service_role;
ALTER TABLE public.xero_contacts_staging ENABLE ROW LEVEL SECURITY;

CREATE POLICY "xero_contacts_staging_select" ON public.xero_contacts_staging
  FOR SELECT TO authenticated
  USING (public.is_platform_owner() OR public.user_has_permission(tenant_id, 'settings.xero.manage'));

CREATE POLICY "xero_contacts_staging_write" ON public.xero_contacts_staging
  FOR ALL TO authenticated
  USING (public.is_platform_owner() OR public.user_has_permission(tenant_id, 'settings.xero.manage'))
  WITH CHECK (public.is_platform_owner() OR public.user_has_permission(tenant_id, 'settings.xero.manage'));

CREATE TRIGGER xero_contacts_staging_updated_at BEFORE UPDATE ON public.xero_contacts_staging
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
