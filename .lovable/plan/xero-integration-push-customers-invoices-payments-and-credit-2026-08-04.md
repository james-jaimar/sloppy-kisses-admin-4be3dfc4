# Xero integration — push customers, invoices, payments and credit notes

Goal: connect the Sloppy Kisses system to the Xero demo organisation so Charlotte and her accountant can see real customers and invoices flowing straight into Xero.

Scope agreed: one-way push (this system → Xero), issued and paid invoices only (no drafts), plus payments recorded here and credit notes.

## What gets built

**1. Connect Xero**
Link the existing "Jaimar xero demo" connection to this project so backend code can call Xero securely through the Lovable connector gateway. No API keys are stored in the app.

**2. Xero settings screen (Admin → Settings → Integrations → Xero)**
Owner-controlled, gated by a new `settings.xero.manage` permission:
- Pick which Xero organisation to sync to (a connection can see several).
- Default sales account code (e.g. 200) and per-service overrides (Daycare, Hotel, Cattery, Grooming, Transport, Retail).
- Tax rate mapping (VAT / zero-rated / exempt) and whether prices include VAT.
- Payment account mapping per payment method (EFT → bank account, Cash → till, Card/PayFast → clearing account).
- Master on/off switch plus "safe mode" so nothing pushes until deliberately enabled.
- Connection health check button ("Test connection") showing the organisation name.

**3. Contact sync (customers)**
- Push a customer to Xero as a Contact: name, email, phone, billing address, account number.
- Match on existing Xero contact by email first to avoid duplicates; otherwise create.
- Store the returned Xero contact ID on the customer so future pushes update rather than duplicate.
- Bulk action: "Push all customers to Xero" with a progress summary, plus a per-customer "Sync to Xero" button on the customer page.

**4. Invoice sync**
- Only invoices in issued / part-paid / paid state; drafts are ignored.
- Pushes as an AUTHORISED Xero invoice using our invoice number as the reference, correct issue and due dates, line items with description, quantity, unit price, account code and tax rate.
- The customer contact is auto-created in Xero first if it isn't there yet.
- Stores the Xero invoice ID and number back on our invoice; re-pushing updates the same Xero invoice instead of creating a second one.
- A "Sync to Xero" button on the invoice, and a bulk backfill for existing invoices with a date filter so the demo starts from a clean month.

**5. Payments and credit notes**
- Payments recorded here push against the matching Xero invoice using the mapped bank/clearing account, so Xero shows the invoice paid.
- Credit notes push as Xero credit notes and are allocated to their invoice.
- Both store their Xero IDs so nothing double-posts.

**6. Automatic push going forward**
Once enabled, newly issued invoices, new payments and new credit notes queue for Xero automatically shortly after they're created — no manual clicking during normal trading.

**7. Sync log and error handling**
- A Xero sync log screen: what was pushed, when, by whom, and the exact Xero error message when something fails (bad account code, missing tax rate, contact rejected).
- Failed items can be retried individually or in bulk.
- Xero rate limits are respected; a run that hits them pauses and resumes rather than failing outright.

## Technical notes

- Database: new `xero_settings` table (per tenant: organisation/tenant id, account code map, tax map, payment account map, enabled flag) and `xero_sync_log` (entity type, entity id, action, status, request/response summary, error, timestamps), both with grants + RLS scoped to tenant staff.
- Existing columns are reused: `customers.xero_customer_id`, `invoices.xero_invoice_id` / `xero_invoice_number`, `credit_notes.xero_credit_note_id` / `xero_credit_note_number`, `invoice_items.xero_account_code`. One new column `payments.xero_payment_id` is added.
- New edge functions: `xero-connection-test`, `xero-push-contacts`, `xero-push-invoices`, `xero-push-payments`, `xero-push-credit-notes`, and a `xero-sync-worker` that drains the queue. All call `https://connector-gateway.lovable.dev/xero`, first hitting `/connections` to resolve the Xero tenant id, then `api.xro/2.0/...` with the `xero-tenant-id` header. All Xero errors are surfaced verbatim into the sync log.
- Auto-push is driven by a lightweight queue table row written on invoice issue / payment insert / credit note issue, drained by the worker on a schedule, so a Xero outage never blocks invoicing here.
- Frontend: `XeroSettingsPage`, `XeroSyncLogPage`, plus "Sync to Xero" actions on customer, invoice and credit note detail pages, all behind the new permission.

## Sequence

1. Link the Xero connection and build the settings screen + connection test.
2. Contact sync (single + bulk).
3. Invoice sync (single + bulk backfill).
4. Payments and credit notes.
5. Auto-push queue + sync log.
6. Backfill demo data and walk through it together before showing Charlotte.
