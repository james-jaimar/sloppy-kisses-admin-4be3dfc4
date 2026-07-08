
-- Product categories
CREATE TABLE public.product_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, name)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_categories TO authenticated;
GRANT ALL ON public.product_categories TO service_role;
ALTER TABLE public.product_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY product_categories_staff_all ON public.product_categories FOR ALL
  USING (public.user_has_tenant_access(tenant_id)) WITH CHECK (public.user_has_tenant_access(tenant_id));
CREATE TRIGGER trg_product_categories_updated BEFORE UPDATE ON public.product_categories
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Stock locations
CREATE TABLE public.stock_locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name text NOT NULL,
  is_default boolean NOT NULL DEFAULT false,
  active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, name)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.stock_locations TO authenticated;
GRANT ALL ON public.stock_locations TO service_role;
ALTER TABLE public.stock_locations ENABLE ROW LEVEL SECURITY;
CREATE POLICY stock_locations_staff_all ON public.stock_locations FOR ALL
  USING (public.user_has_tenant_access(tenant_id)) WITH CHECK (public.user_has_tenant_access(tenant_id));
CREATE TRIGGER trg_stock_locations_updated BEFORE UPDATE ON public.stock_locations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Seed one default location per existing tenant
INSERT INTO public.stock_locations (tenant_id, name, is_default)
SELECT t.id, 'Main store', true FROM public.tenants t
ON CONFLICT DO NOTHING;

-- Extend products
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS barcode text,
  ADD COLUMN IF NOT EXISTS unit text,
  ADD COLUMN IF NOT EXISTS vat_rate numeric(5,2) NOT NULL DEFAULT 15,
  ADD COLUMN IF NOT EXISTS reorder_level numeric(12,2),
  ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS category_id uuid REFERENCES public.product_categories(id) ON DELETE SET NULL;

-- Stock movement reason enum
DO $$ BEGIN
  CREATE TYPE public.stock_movement_reason AS ENUM ('receive','sale','adjustment','wastage','return');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Stock movements ledger
CREATE TABLE public.stock_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  location_id uuid NOT NULL REFERENCES public.stock_locations(id) ON DELETE RESTRICT,
  qty_delta numeric(12,2) NOT NULL,
  reason public.stock_movement_reason NOT NULL,
  ref_type text,
  ref_id uuid,
  notes text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.stock_movements TO authenticated;
GRANT ALL ON public.stock_movements TO service_role;
ALTER TABLE public.stock_movements ENABLE ROW LEVEL SECURITY;
CREATE POLICY stock_movements_staff_all ON public.stock_movements FOR ALL
  USING (public.user_has_tenant_access(tenant_id)) WITH CHECK (public.user_has_tenant_access(tenant_id));
CREATE INDEX idx_stock_movements_product ON public.stock_movements(tenant_id, product_id);
CREATE INDEX idx_stock_movements_location ON public.stock_movements(tenant_id, location_id);
CREATE INDEX idx_stock_movements_ref ON public.stock_movements(ref_type, ref_id);

-- Retail settings (one per tenant)
CREATE TABLE public.retail_settings (
  tenant_id uuid PRIMARY KEY REFERENCES public.tenants(id) ON DELETE CASCADE,
  default_vat_rate numeric(5,2) NOT NULL DEFAULT 15,
  allow_negative_stock boolean NOT NULL DEFAULT false,
  low_stock_notify_emails text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.retail_settings TO authenticated;
GRANT ALL ON public.retail_settings TO service_role;
ALTER TABLE public.retail_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY retail_settings_staff_all ON public.retail_settings FOR ALL
  USING (public.user_has_tenant_access(tenant_id)) WITH CHECK (public.user_has_tenant_access(tenant_id));
CREATE TRIGGER trg_retail_settings_updated BEFORE UPDATE ON public.retail_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Link invoice line to the stock movement it caused
ALTER TABLE public.invoice_items
  ADD COLUMN IF NOT EXISTS stock_movement_id uuid REFERENCES public.stock_movements(id) ON DELETE SET NULL;

-- Current on-hand view
CREATE OR REPLACE VIEW public.v_stock_on_hand AS
SELECT
  m.tenant_id,
  m.product_id,
  m.location_id,
  COALESCE(SUM(m.qty_delta), 0) AS qty_on_hand,
  MAX(m.created_at) AS last_movement_at
FROM public.stock_movements m
GROUP BY m.tenant_id, m.product_id, m.location_id;

GRANT SELECT ON public.v_stock_on_hand TO authenticated;
GRANT SELECT ON public.v_stock_on_hand TO service_role;
