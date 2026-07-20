CREATE OR REPLACE FUNCTION public.invoices_lock_after_send()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_locked billing_status[] := ARRAY['sent','part_paid','paid','overdue','cancelled']::billing_status[];
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.status = ANY(v_locked) THEN
    IF NEW.customer_id   IS DISTINCT FROM OLD.customer_id
       OR NEW.invoice_number IS DISTINCT FROM OLD.invoice_number
       OR NEW.subtotal   IS DISTINCT FROM OLD.subtotal
       OR NEW.total      IS DISTINCT FROM OLD.total
       OR NEW.tenant_id  IS DISTINCT FROM OLD.tenant_id
    THEN
      IF public.is_platform_owner() THEN
        NULL;
      ELSIF NEW.total IS DISTINCT FROM OLD.total
            OR NEW.subtotal IS DISTINCT FROM OLD.subtotal THEN
        RAISE EXCEPTION 'Invoice %/% is locked (status=%). Line-item and total changes are not allowed. Issue a credit note instead.',
          OLD.tenant_id, OLD.invoice_number, OLD.status
          USING ERRCODE = 'P0001';
      ELSE
        RAISE EXCEPTION 'Invoice %/% is locked (status=%). Only status/notes/xero/payment fields may change.',
          OLD.tenant_id, OLD.invoice_number, OLD.status
          USING ERRCODE = 'P0001';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;