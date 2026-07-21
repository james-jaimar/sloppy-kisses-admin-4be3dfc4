## Revised Slice 2 — Payment capture polish + Xero-ready data

Scope corrected: no reconciliation, no bank CSV import, no bank connections. Xero will do the heavy accounting later; this app just needs clean, complete data to hand over and easy tools for admin to mark invoices paid from emailed proofs of payment.

### What to build

**1. Payment allocation across multiple invoices**
On a customer's page (and from the Record Payment dialog when opened without a specific invoice), let admin capture one payment and split it across several open invoices in one go.
- New "Record payment" entry point on customer detail → Invoices tab and on `/admin/payments`.
- Dialog lists the customer's unpaid invoices oldest-first with an amount input per row; "Auto-allocate" button fills top-down.
- Any unallocated remainder posts to `customer_credit_ledger` as credit (existing table).
- Server-side RPC does the allocation atomically so partial failures can't leave orphaned rows.

**2. Proof-of-payment attachments**
So admin has an audit trail when they mark an invoice paid from an emailed POP.
- Add optional file upload to the Record Payment dialog (PDF/JPG/PNG, single file).
- Store in existing `documents` bucket, link via new `payments.proof_document_id`.
- Show a paperclip + "View proof" link on the payment row in invoice detail and payments list.

**3. Xero-ready data hygiene**
Small, targeted additions so the eventual Xero export is clean:
- Add a **Xero contact code** field on customers (free text, defaults to SK number). Shown in customer detail and included in CSV exports.
- Add **account code** (free text) on `products` and on `invoice_items` so lines can map to Xero revenue accounts. Default per product; overridable per line.
- Ensure every invoice line has: description, quantity, unit price, VAT rate, account code, contact code.
- **Xero-format CSV export** on `/admin/invoices` — one row per invoice line matching Xero's Sales Invoice import columns (ContactName, EmailAddress, InvoiceNumber, InvoiceDate, DueDate, Description, Quantity, UnitAmount, AccountCode, TaxType, TrackingName1, etc.). Sits alongside the existing plain CSV.
- **Xero-format payments CSV** — one row per payment (Date, Amount, Payee, Reference, InvoiceNumber).

**4. Small quality-of-life on payments list**
- "Attach proof" action on existing payments that don't have one yet (for POPs received after the fact).
- Show allocation breakdown when a payment covers multiple invoices (expandable row).

### What we're explicitly NOT doing
- No bank statement import / CSV reconciliation.
- No bank feed connections.
- No auto-matching of bank lines to invoices.
- No double-entry ledger in-app — Xero owns that.

### Technical notes
- New migration: `payments.proof_document_id uuid`, `payment_allocations` table (payment_id, invoice_id, amount) + RPC `allocate_payment(p_payment_id, p_allocations jsonb)`, `customers.xero_contact_code text`, `products.xero_account_code text`, `invoice_items.xero_account_code text`.
- Xero VAT mapping: SA standard rate 15% → `TaxType = "Tax on Sales"` (configurable in Invoicing Settings later if needed).
- All new fields optional / nullable so existing data keeps working.
- Update `RecordPaymentDialog.tsx` to support multi-invoice mode when opened without a specific invoice.

### Order of work
1. Migration (allocations table, RPC, new columns, storage link).
2. Multi-invoice Record Payment dialog + entry points.
3. Proof-of-payment upload + display.
4. Xero CSV exports (invoices + payments).
5. Xero code fields UI (customer, product, line override).
