-- 1) Product image + fast barcode/sku lookup
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS image_url text;
CREATE INDEX IF NOT EXISTS products_barcode_idx ON public.products (tenant_id, barcode) WHERE barcode IS NOT NULL;
CREATE INDEX IF NOT EXISTS products_sku_idx ON public.products (tenant_id, sku) WHERE sku IS NOT NULL;

-- 2) Till settings
ALTER TABLE public.retail_settings
  ADD COLUMN IF NOT EXISTS till_name text NOT NULL DEFAULT 'Front Desk',
  ADD COLUMN IF NOT EXISTS receipt_footer text,
  ADD COLUMN IF NOT EXISTS pos_location_id uuid REFERENCES public.stock_locations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS walkin_customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL;

-- 3) Parked sales
CREATE TABLE IF NOT EXISTS public.pos_parked_sales (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  label text,
  customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  cart jsonb NOT NULL DEFAULT '[]'::jsonb,
  total numeric NOT NULL DEFAULT 0,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pos_parked_sales TO authenticated;
GRANT ALL ON public.pos_parked_sales TO service_role;

ALTER TABLE public.pos_parked_sales ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Staff manage parked sales in their tenant" ON public.pos_parked_sales;
CREATE POLICY "Staff manage parked sales in their tenant"
ON public.pos_parked_sales FOR ALL TO authenticated
USING (public.user_has_tenant_access(tenant_id))
WITH CHECK (public.user_has_tenant_access(tenant_id));

DROP TRIGGER IF EXISTS pos_parked_sales_updated_at ON public.pos_parked_sales;
CREATE TRIGGER pos_parked_sales_updated_at
BEFORE UPDATE ON public.pos_parked_sales
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 4) Permission
INSERT INTO public.permissions (code, label, description)
VALUES ('pos.operate', 'Operate point of sale', 'Use the shop till: ring up sales, take payment, print receipts')
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.role_permissions (role_id, permission_id)
SELECT rp.role_id, p.id
FROM public.role_permissions rp
JOIN public.permissions pv ON pv.id = rp.permission_id AND pv.code = 'products.manage'
CROSS JOIN public.permissions p
WHERE p.code = 'pos.operate'
ON CONFLICT DO NOTHING;