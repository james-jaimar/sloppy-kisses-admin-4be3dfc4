CREATE OR REPLACE FUNCTION public.invoice_items_fill_product_codes()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.product_id IS NOT NULL AND (NEW.item_code IS NULL OR NEW.xero_account_code IS NULL) THEN
    SELECT COALESCE(NEW.item_code, NULLIF(trim(p.external_code), '')),
           COALESCE(NEW.xero_account_code, NULLIF(trim(p.xero_account_code), ''))
      INTO NEW.item_code, NEW.xero_account_code
      FROM public.products p WHERE p.id = NEW.product_id;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.invoice_items_fill_product_codes() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS invoice_items_fill_product_codes ON public.invoice_items;
CREATE TRIGGER invoice_items_fill_product_codes
BEFORE INSERT OR UPDATE OF product_id ON public.invoice_items
FOR EACH ROW EXECUTE FUNCTION public.invoice_items_fill_product_codes();