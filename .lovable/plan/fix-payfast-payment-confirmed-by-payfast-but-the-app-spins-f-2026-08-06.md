# Fix: PayFast payment confirmed by PayFast but the app spins forever

## What actually happened

The payment succeeded at PayFast and the ITN (webhook) did arrive — it was logged at 16:34:43 with `payment_status=COMPLETE`, `pf_payment_id=3311187`, R545.00 for INV00245.

The webhook then rejected it with `outcome=error`, `error_text=invoice_not_found`, even though invoice INV00245 exists and is still `issued` with R545.00 outstanding.

Root cause: the webhook's invoice lookup selects a column that does not exist on `invoices`:

```
.select("id, tenant_id, customer_id, total, balance_due, status, currency")
```

There is no `currency` column on `invoices`. PostgREST returns an error, the code only reads `data` and ignores `error`, so `inv` is null and the handler bails out with "invoice_not_found" before signature verification, payment insert, or attempt update ever run.

Because the payment row is never created, `payment_attempts` stays at `redirected`, so the success page polls for 60 seconds and then falls back to "Still waiting on PayFast". No PayFast ITN is retried by us, so the invoice stays unpaid and nothing syncs to Xero.

## The fix

1. **Webhook query** — drop `currency` from the select in `payment-gateway-webhook`, and stop swallowing errors: capture the PostgREST `error` and log/record it as `invoice_lookup_failed` with the real message instead of the misleading `invoice_not_found`. Same treatment for the refund-path lookup.
2. **Fail loudly** — anywhere the webhook destructures only `data`, also read `error` and write it into `payment_webhook_events.error_text` so a schema drift like this shows up as the actual cause next time.
3. **Replay the stuck payment** — re-process the already-logged ITN for INV00245 (event `fda174b3…`) so the payment record, invoice balance, `payment_attempts` status and Xero sync all catch up. No new charge is taken; the raw ITN body is stored and can be re-fed to the fixed handler.
4. **Recovery for future stalls** — add a small "Reprocess" action on failed rows in the payments/webhook events view so a stuck ITN can be replayed from the admin UI instead of needing a developer.
5. **Success page** — after the 60s poll window, if the attempt is still unconfirmed, show the invoice balance and a "Check again" button rather than leaving the user with a dead end.

## Verification

- Re-run the stored ITN through the fixed function and confirm: `payments` row created, INV00245 balance 0 / status paid, `payment_attempts` → succeeded, `payment_webhook_events.outcome` = ok.
- Confirm the invoice appears in the Xero sync queue and syncs.
- Do one fresh sandbox PayFast payment end to end and confirm the success page flips to "Payment confirmed" within a few seconds.
