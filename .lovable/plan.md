## Root cause (confirmed)

Issuing INV00097 fails with Postgres error:

> `record "new" has no field "currency"`

The BEFORE UPDATE trigger `invoices_lock_after_send` references `NEW.currency` / `OLD.currency`, but the `invoices` table has no `currency` column. The trigger works on the initial draft→sent transition (guard `OLD.status = ANY(v_locked)` is false), but the client mutation then calls `recomputeInvoiceTotals()` a second time — now `OLD.status='sent'`, the guard passes, and Postgres evaluates the `NEW.currency` reference and blows up. That's why INV00097 shows `status='sent'` in the DB yet the UI still reports an error (the second update failed and threw).

## Fix

Migration to redefine `public.invoices_lock_after_send()` and drop the `currency` field comparison (there's no currency column and no plan to add one — ZAR only per project memory). Keep all other lock behavior identical.

```sql
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
```

No frontend changes needed.

## Verification

- Re-issue an existing draft invoice → succeeds, status flips to `sent`, no Postgres error.
- INV00097 is already `sent`; totals will be recomputed on next line change to confirm the lock still fires correctly for real edits.
