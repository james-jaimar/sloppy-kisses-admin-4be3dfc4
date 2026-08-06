# Check PayFast capture and the Xero follow-through

## What I verified just now

- `payments`, `payment_attempts` and `payment_webhook_events` are **all empty**. No online payment has ever been captured, and no checkout has been started since the gateway logging was added — so there is nothing yet to prove the path works either way.
- PayFast is configured: sandbox/test mode, merchant `10052458`, notify URL on the Supabase functions endpoint, return/cancel URLs on the custom domain. The webhook logs every inbound ITN before validating, so the next attempt will be visible whatever happens.
- Xero auto-sync **is running**: the per-minute cron fires, and `xero_sync_log` shows invoice updates succeeding minutes ago. There are 125 queued invoices left from the VAT-inclusive recalculation, draining at 5 per minute (~25 minutes). One item is stuck failed: INV00242, a R0 invoice already authorised in Xero.
- Payments do enqueue to Xero automatically (`payments_xero_queue` trigger on insert).
- **The blocker for payments:** Xero settings has `payment_accounts` set to an empty object. `pushPayment` requires a bank account code per payment method and throws `No Xero bank account mapped for payment method "payfast"`. So even a perfectly captured PayFast payment will fail to reach Xero today.

## Plan

### 1. Map Xero bank accounts (required before any payment can sync)
- Pull the Xero chart of accounts (bank/current accounts) through the existing sync function and turn the current free-text account-code boxes in Settings → Xero into a dropdown per payment method (payfast, eft, cash, card, manual), plus a default.
- Save mappings so `payment_accounts` is populated. Show a warning on the Xero settings page while any enabled payment method is unmapped.

### 2. Prove capture end to end
- Use the existing "Send test ITN" self-test against an unpaid test invoice: confirms signature, invoice match, payment insert, allocation and balance update, all visible in Gateway activity.
- Then walk one real sandbox PayFast payment (deposit part-payment on the hotel invoice INV00243, R1 680 of R3 360) from the portal, and confirm:
  - a `payment_attempts` row on redirect,
  - a `payment_webhook_events` row with outcome `accepted`,
  - a `payments` row, invoice moving to `part_paid` with the balance reduced,
  - the success page picking up the confirmation.

### 3. Confirm the Xero follow-through
- After the payment lands, check the queue picks up both the payment and the updated invoice, and that Xero shows the invoice as part paid with a payment against the mapped bank account.
- Report the actual Xero payment id back, not just "it queued".

### 4. Tidy the two known queue issues
- Clear the stuck INV00242 failure (R0 invoice, authorised in Xero and not modifiable) so the failed count reflects real problems.
- Let the 125-item backlog finish, then confirm the queue is empty.

## Technical notes

- New `list_accounts` action in `supabase/functions/xero-sync/index.ts` calling `Accounts?where=Type=="BANK"`, surfaced through `src/features/xero/queries.ts` and the mapping UI in `XeroSettingsPage.tsx`.
- No database migration needed — `xero_settings.payment_accounts` already exists as jsonb.
- Steps 2–4 are verification runs, not code; any defect they surface gets fixed in the same pass.
