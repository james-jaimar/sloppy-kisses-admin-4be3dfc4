CREATE TABLE public.product_barcodes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  code text NOT NULL,
  is_primary boolean NOT NULL DEFAULT false,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_barcodes TO authenticated;
GRANT ALL ON public.product_barcodes TO service_role;

ALTER TABLE public.product_barcodes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant staff manage product barcodes"
ON public.product_barcodes
FOR ALL
TO authenticated
USING (public.user_has_tenant_access(tenant_id))
WITH CHECK (public.user_has_tenant_access(tenant_id));

CREATE UNIQUE INDEX product_barcodes_tenant_code_uniq
  ON public.product_barcodes (tenant_id, lower(code));
CREATE INDEX product_barcodes_product_idx ON public.product_barcodes (product_id);

CREATE TRIGGER product_barcodes_updated_at
BEFORE UPDATE ON public.product_barcodes
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Keep products.barcode in sync with the primary code
CREATE OR REPLACE FUNCTION public.product_barcodes_sync_primary()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  pid uuid;
  next_code text;
BEGIN
  pid := COALESCE(NEW.product_id, OLD.product_id);

  IF TG_OP <> 'DELETE' AND NEW.is_primary THEN
    UPDATE public.product_barcodes
       SET is_primary = false
     WHERE product_id = pid AND id <> NEW.id AND is_primary;
  END IF;

  SELECT code INTO next_code
    FROM public.product_barcodes
   WHERE product_id = pid
   ORDER BY is_primary DESC, created_at ASC
   LIMIT 1;

  UPDATE public.products SET barcode = next_code WHERE id = pid;

  RETURN COALESCE(NEW, OLD);
END;
$$;

REVOKE ALL ON FUNCTION public.product_barcodes_sync_primary() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER product_barcodes_sync
AFTER INSERT OR UPDATE OR DELETE ON public.product_barcodes
FOR EACH ROW EXECUTE FUNCTION public.product_barcodes_sync_primary();

ALTER TABLE public.retail_settings
  ADD COLUMN IF NOT EXISTS allow_multi_barcode boolean NOT NULL DEFAULT false;

-- Backfill existing product barcodes into the new table
INSERT INTO public.product_barcodes (tenant_id, product_id, code, is_primary)
SELECT tenant_id, id, barcode, true
FROM public.products
WHERE barcode IS NOT NULL AND btrim(barcode) <> ''
ON CONFLICT DO NOTHING;