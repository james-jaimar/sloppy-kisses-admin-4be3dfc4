
ALTER TABLE public.invoice_items
  ADD COLUMN IF NOT EXISTS vat_rate NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS vat_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS discount_pct NUMERIC(5,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS discount_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS vat_inclusive BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS tax_total NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS discount_total NUMERIC(12,2) NOT NULL DEFAULT 0;

ALTER TABLE public.invoicing_settings
  ADD COLUMN IF NOT EXISTS prices_include_vat BOOLEAN NOT NULL DEFAULT false;

-- Backfill existing rows: preserve historical totals (no VAT). Bypass the
-- "invoice locked after send" trigger for this one-off maintenance update.
ALTER TABLE public.invoice_items DISABLE TRIGGER USER;
UPDATE public.invoice_items SET vat_rate = 0 WHERE vat_rate IS NULL;
ALTER TABLE public.invoice_items ENABLE TRIGGER USER;

-- BEFORE trigger: compute discount / vat / line_total
CREATE OR REPLACE FUNCTION public.invoice_items_compute()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  v_gross NUMERIC(14,4);
  v_disc  NUMERIC(14,4);
  v_net   NUMERIC(14,4);
  v_rate  NUMERIC(5,2);
BEGIN
  IF NEW.vat_rate IS NULL THEN
    SELECT COALESCE(default_vat_rate, 0) INTO v_rate
      FROM public.invoicing_settings WHERE tenant_id = NEW.tenant_id;
    NEW.vat_rate := COALESCE(v_rate, 0);
  END IF;

  v_gross := ROUND(COALESCE(NEW.quantity, 0) * COALESCE(NEW.unit_price, 0), 4);
  v_disc  := ROUND(v_gross * COALESCE(NEW.discount_pct, 0) / 100.0, 2);
  NEW.discount_amount := v_disc;

  IF NEW.vat_inclusive THEN
    v_net := ROUND((v_gross - v_disc) / (1 + NEW.vat_rate / 100.0), 2);
    NEW.line_total := v_net;
    NEW.vat_amount := ROUND((v_gross - v_disc) - v_net, 2);
  ELSE
    v_net := ROUND(v_gross - v_disc, 2);
    NEW.line_total := v_net;
    NEW.vat_amount := ROUND(v_net * NEW.vat_rate / 100.0, 2);
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_invoice_items_compute ON public.invoice_items;
CREATE TRIGGER trg_invoice_items_compute
BEFORE INSERT OR UPDATE ON public.invoice_items
FOR EACH ROW EXECUTE FUNCTION public.invoice_items_compute();

-- AFTER trigger: roll up totals to invoice
CREATE OR REPLACE FUNCTION public.invoice_items_recompute_invoice()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  v_inv uuid := COALESCE(NEW.invoice_id, OLD.invoice_id);
  v_sub  NUMERIC(12,2);
  v_tax  NUMERIC(12,2);
  v_disc NUMERIC(12,2);
BEGIN
  IF v_inv IS NULL THEN RETURN NULL; END IF;

  SELECT COALESCE(SUM(line_total), 0),
         COALESCE(SUM(vat_amount), 0),
         COALESCE(SUM(discount_amount), 0)
    INTO v_sub, v_tax, v_disc
    FROM public.invoice_items WHERE invoice_id = v_inv;

  UPDATE public.invoices
     SET subtotal       = v_sub,
         tax_total      = v_tax,
         discount_total = v_disc,
         total          = v_sub + v_tax,
         balance_due    = GREATEST((v_sub + v_tax) - COALESCE(amount_paid, 0), 0)
   WHERE id = v_inv;

  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS trg_invoice_items_recompute ON public.invoice_items;
CREATE TRIGGER trg_invoice_items_recompute
AFTER INSERT OR UPDATE OR DELETE ON public.invoice_items
FOR EACH ROW EXECUTE FUNCTION public.invoice_items_recompute_invoice();

-- Backfill existing invoice tax_total / discount_total (0 for all historical)
UPDATE public.invoices i SET
  tax_total = COALESCE(t.vat_sum, 0),
  discount_total = COALESCE(t.disc_sum, 0)
FROM (
  SELECT invoice_id,
         SUM(vat_amount) AS vat_sum,
         SUM(discount_amount) AS disc_sum
    FROM public.invoice_items
   GROUP BY invoice_id
) t
WHERE i.id = t.invoice_id;
