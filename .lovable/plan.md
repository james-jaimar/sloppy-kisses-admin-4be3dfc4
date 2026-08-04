# Fix Xero push: only 4 invoices landed, and VAT posts as the old 14% rate

## What I found (verified against the live data)

**1. Almost every invoice failed on the contact, not the invoice.**
Xero rejected 30+ pushes with:
`Error converting value "Ashleigh Gray- Yorkie -Pepper(S)" to type 'System.Guid'. Path 'Invoices[0].Contact.ContactID'`

The `customers.xero_customer_id` column was already populated during the legacy customer import with a descriptive label (owner name + dogs), not a Xero contact GUID. Counts today: 4,086 customers, 4,085 with a value, only **3** of which are real GUIDs. The sync function trusts that column (`ensureContact` returns it as-is), so it sends a name where Xero expects a GUID and the invoice is rejected before it is created. The customer-backfill screen also under-reports work to do, because it only counts rows where the column is `NULL`.

The rest of the failures were transport-level: 15 x `503` from Xero and 4 x `429` (rate limit). The pusher loops invoices back-to-back with no pacing and only stops on 429.

Net result: 4 invoices in Xero out of 240.

**2. The 14% VAT is coming from us, not Xero.**
`xero_settings.default_tax_type` is `OUTPUT`. In a South African Xero org, `OUTPUT` is the legacy 14% standard rate; the current 15% rate is `OUTPUT2`. Every line we push carries `TaxType: "OUTPUT"`, so Xero shows "Old 14% Standard Rate Sales". The Settings screen offers this as a free-text box defaulting to `OUTPUT`, so it was never going to be right by accident.

## The fix

### A. Stop trusting the imported contact value
- Migration: null out `customers.xero_customer_id` wherever it is not a valid UUID (4,082 rows), so the column only ever holds real Xero contact IDs. The legacy label is still available in the imported raw customer data, so nothing is lost.
- Harden `xero-sync`: treat a non-UUID `xero_customer_id` as "not linked" and re-resolve it, so bad data can never be posted again.
- Improve contact matching before creating: match on email, then fall back to `Name` and `AccountNumber` (customer number) so re-runs update the existing Xero contact instead of duplicating it.
- Fix the backfill counts in the Xero settings screen to count "no valid Xero contact" rather than "column is null".

### B. Post the correct VAT rate
- Add a **Load tax rates** action that pulls the org's live `TaxRates` from Xero and turns the two tax-type boxes into pickers showing the real name and percentage ("15% Standard rate sales — OUTPUT2"), so this is chosen, not typed.
- Change the default for new setups from `OUTPUT` to `OUTPUT2`, and update this tenant's setting to the 15% rate.
- Show the currently selected rate's name and percentage inline as a sanity check.
- Note: the 4 invoices already in Xero were posted at 14%. Once the rate is corrected, re-pushing them updates them in place (we send the stored `InvoiceID`), provided they are not already paid/locked in Xero. I will re-push them as part of the verification and report anything Xero refuses to change.

### C. Make bulk pushes survive Xero's limits
- Route bulk work through the existing `xero_sync_queue` instead of a tight loop: small batches, a short pause between calls, and retry with backoff on `429` (honouring `Retry-After`) and on `503`.
- Stop treating `503` as a permanent failure — it currently burns the attempt; it should re-queue.
- Surface progress in the sync log page: pending / done / failed counts, and a "Retry failed" button.

## Technical notes
- Migration: `UPDATE public.customers SET xero_customer_id = NULL WHERE xero_customer_id !~* '<uuid regex>'`.
- `supabase/functions/xero-sync/index.ts`: UUID guard in `ensureContact`/`pushCustomer`, name+account-number contact matching, retry/backoff helper around `xero()`, queue-based bulk push.
- `supabase/functions/_shared/xero.ts`: return `Retry-After` on the thrown error so the caller can back off correctly.
- `src/features/xero/XeroSettingsPage.tsx`: tax-rate pickers + `load_tax_rates` action; `src/features/xero/queries.ts`: fixed backfill counts.

## Verification
Re-push a handful of invoices, confirm in the log that contacts resolve to GUIDs and lines land as 15% standard rate, then run the full backfill through the queue and report the final done/failed counts with reasons.
