CREATE TABLE public.product_brands (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_brands TO authenticated;
GRANT ALL ON public.product_brands TO service_role;

ALTER TABLE public.product_brands ENABLE ROW LEVEL SECURITY;

CREATE POLICY product_brands_staff_all ON public.product_brands
  FOR ALL TO authenticated
  USING (user_has_tenant_access(tenant_id))
  WITH CHECK (user_has_tenant_access(tenant_id));

CREATE UNIQUE INDEX product_brands_tenant_name_key ON public.product_brands (tenant_id, lower(name));

CREATE TRIGGER trg_product_brands_updated_at BEFORE UPDATE ON public.product_brands
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.product_categories
  ADD COLUMN parent_id uuid REFERENCES public.product_categories(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX product_categories_tenant_parent_name_key
  ON public.product_categories (tenant_id, coalesce(parent_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(name));

ALTER TABLE public.products
  ADD COLUMN brand_id uuid REFERENCES public.product_brands(id) ON DELETE SET NULL,
  ADD COLUMN species text,
  ADD COLUMN size_pack text,
  ADD COLUMN variant_label text,
  ADD COLUMN parent_product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  ADD COLUMN sell_in_pos boolean NOT NULL DEFAULT true,
  ADD COLUMN notes text,
  ADD COLUMN source_ref text;

CREATE UNIQUE INDEX products_tenant_external_code_key
  ON public.products (tenant_id, external_code) WHERE external_code IS NOT NULL;

CREATE INDEX products_brand_idx ON public.products (tenant_id, brand_id);
CREATE INDEX products_parent_idx ON public.products (parent_product_id);

ALTER TABLE public.retail_settings
  ADD COLUMN prices_include_vat boolean NOT NULL DEFAULT true;