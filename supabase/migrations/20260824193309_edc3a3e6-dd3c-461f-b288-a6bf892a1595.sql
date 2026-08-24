-- 1. Resource type: retail till
ALTER TYPE public.resource_type ADD VALUE IF NOT EXISTS 'retail_till';

-- 2. New permissions
INSERT INTO public.permissions (code, label, description) VALUES
  ('pos.barcode.link', 'Link barcodes', 'Assign an unknown scanned barcode to an existing product'),
  ('products.photos',  'Manage product photos', 'Upload or replace product photos'),
  ('stock.view',       'View stock', 'View stock levels and movements'),
  ('stock.adjust',     'Adjust stock', 'Receive stock, record wastage and stock takes')
ON CONFLICT (code) DO NOTHING;

-- 3. Retail settings columns
ALTER TABLE public.retail_settings
  ADD COLUMN IF NOT EXISTS till_resource_id uuid REFERENCES public.resources(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS pos_page_size integer NOT NULL DEFAULT 24,
  ADD COLUMN IF NOT EXISTS unknown_barcode_action text NOT NULL DEFAULT 'link',
  ADD COLUMN IF NOT EXISTS scan_beep boolean NOT NULL DEFAULT true;

-- 4. Barcode uniqueness per tenant
CREATE UNIQUE INDEX IF NOT EXISTS products_tenant_barcode_unique
  ON public.products (tenant_id, lower(barcode))
  WHERE barcode IS NOT NULL AND barcode <> '';

-- 5. Unknown barcode queue
CREATE TABLE IF NOT EXISTS public.pos_barcode_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  code text NOT NULL,
  scan_count integer NOT NULL DEFAULT 1,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  last_scanned_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  note text,
  resolved_product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  resolved_at timestamptz,
  resolved_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, code)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pos_barcode_queue TO authenticated;
GRANT ALL ON public.pos_barcode_queue TO service_role;

ALTER TABLE public.pos_barcode_queue ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pos_barcode_queue_staff_all ON public.pos_barcode_queue;
CREATE POLICY pos_barcode_queue_staff_all ON public.pos_barcode_queue
  FOR ALL TO authenticated
  USING (public.user_has_tenant_access(tenant_id))
  WITH CHECK (public.user_has_tenant_access(tenant_id));

DROP TRIGGER IF EXISTS trg_pos_barcode_queue_updated_at ON public.pos_barcode_queue;
CREATE TRIGGER trg_pos_barcode_queue_updated_at
  BEFORE UPDATE ON public.pos_barcode_queue
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 6. Shop Staff role per tenant + permission seeding
DO $$
DECLARE
  t record;
  shop_role uuid;
BEGIN
  FOR t IN SELECT id FROM public.tenants LOOP
    INSERT INTO public.roles (tenant_id, code, label, description, is_system_role)
    VALUES (t.id, 'staff_shop', 'Shop Staff', 'Runs the till, views products and stock', true)
    ON CONFLICT DO NOTHING;

    SELECT id INTO shop_role FROM public.roles WHERE tenant_id = t.id AND code = 'staff_shop';

    IF shop_role IS NOT NULL THEN
      INSERT INTO public.role_permissions (role_id, permission_id)
      SELECT shop_role, p.id FROM public.permissions p
      WHERE p.code IN ('pos.operate','pos.barcode.link','products.view','products.photos',
                       'stock.view','customers.view','invoices.view')
      ON CONFLICT DO NOTHING;
    END IF;

    -- Front desk and accounts also work the counter
    INSERT INTO public.role_permissions (role_id, permission_id)
    SELECT r.id, p.id
    FROM public.roles r
    JOIN public.permissions p ON p.code IN ('pos.operate','pos.barcode.link','stock.view','stock.adjust')
    WHERE r.tenant_id = t.id AND r.code IN ('staff_frontdesk','staff_accounts')
    ON CONFLICT DO NOTHING;

    -- Admin/owner get the new codes
    INSERT INTO public.role_permissions (role_id, permission_id)
    SELECT r.id, p.id
    FROM public.roles r
    JOIN public.permissions p ON p.code IN ('pos.barcode.link','products.photos','stock.view','stock.adjust')
    WHERE r.tenant_id = t.id AND r.code IN ('tenant_admin','tenant_owner','platform_owner')
    ON CONFLICT DO NOTHING;
  END LOOP;
END $$;
