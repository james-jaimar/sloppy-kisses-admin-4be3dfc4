ALTER TABLE public.estimates ADD COLUMN IF NOT EXISTS xero_quote_id text;
ALTER TABLE public.xero_sync_queue DROP CONSTRAINT xero_sync_queue_entity_type_check;
ALTER TABLE public.xero_sync_queue ADD CONSTRAINT xero_sync_queue_entity_type_check CHECK (entity_type = ANY (ARRAY['customer','invoice','payment','credit_note','quote']));

CREATE OR REPLACE FUNCTION public.xero_queue_estimate()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  -- Quotes imported from Xero already exist there; never push them back.
  IF COALESCE(NEW.created_via,'') = 'hotel_sheet_import' THEN RETURN NEW; END IF;
  IF TG_OP = 'INSERT' OR NEW.status IS DISTINCT FROM OLD.status OR NEW.estimate_number IS DISTINCT FROM OLD.estimate_number
     OR NEW.total IS DISTINCT FROM OLD.total OR NEW.expiry_date IS DISTINCT FROM OLD.expiry_date THEN
    PERFORM public.xero_enqueue(NEW.tenant_id, 'quote', NEW.id);
  END IF;
  RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION public.xero_queue_estimate() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_xero_queue_estimate ON public.estimates;
CREATE TRIGGER trg_xero_queue_estimate AFTER INSERT OR UPDATE ON public.estimates
  FOR EACH ROW EXECUTE FUNCTION public.xero_queue_estimate();

-- Line edits also re-sync the quote.
CREATE OR REPLACE FUNCTION public.xero_queue_estimate_item()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE e record;
BEGIN
  SELECT id, tenant_id, created_via INTO e FROM public.estimates WHERE id = COALESCE(NEW.estimate_id, OLD.estimate_id);
  IF e.id IS NOT NULL AND COALESCE(e.created_via,'') <> 'hotel_sheet_import' THEN
    PERFORM public.xero_enqueue(e.tenant_id, 'quote', e.id);
  END IF;
  RETURN NULL;
END; $$;
REVOKE ALL ON FUNCTION public.xero_queue_estimate_item() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_xero_queue_estimate_item ON public.estimate_items;
CREATE TRIGGER trg_xero_queue_estimate_item AFTER INSERT OR UPDATE OR DELETE ON public.estimate_items
  FOR EACH ROW EXECUTE FUNCTION public.xero_queue_estimate_item();

-- Queue the two app quotes made so far.
SELECT public.xero_enqueue(tenant_id, 'quote', id) FROM public.estimates WHERE COALESCE(created_via,'') <> 'hotel_sheet_import';