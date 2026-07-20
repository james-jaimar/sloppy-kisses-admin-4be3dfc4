## Root cause

The enrolment save fails inside the auto-invoice trigger chain, not in the enrolment insert itself.

- `daycare_enrolments_auto_invoice()` calls `ensure_draft_invoice()`, then `UPDATE public.invoices ... WHERE id = v_inv`.
- That UPDATE fires trigger `trg_invoices_lock_after_send` → function `invoices_lock_after_send()`.
- Inside that function:
  ```sql
  v_locked_statuses text[] := ARRAY['sent','part_paid','paid','overdue','cancelled'];
  IF TG_OP = 'UPDATE' AND OLD.status = ANY(v_locked_statuses) THEN
  ```
  `OLD.status` is enum `billing_status`; `v_locked_statuses` is `text[]`. Postgres has no implicit `billing_status = text` operator, so every UPDATE on `invoices` raises:
  `operator does not exist: billing_status = text`.

This is why the enrolment (and any other flow that updates an invoice row via a trigger — recompute totals from hotel/grooming/transport auto-invoice, payments, refunds) breaks the moment an invoice already exists to update.

## Fix

Single migration that redefines `public.invoices_lock_after_send()` to compare enum-to-enum:

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
    ... (existing body unchanged) ...
  END IF;
  RETURN NEW;
END;
$$;
```

No schema changes, no data changes, no frontend changes.

## Verification

1. After migration, retry adding Jackson to daycare — the enrolment saves and a draft invoice line is created.
2. Sanity-check with `supabase--read_query`: `UPDATE public.invoices SET updated_at = now() WHERE id = <any existing draft>` no longer errors.
3. Confirm locked-invoice guard still works: attempt to change `total` on a `sent` invoice must still be blocked.
