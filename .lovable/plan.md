## Phase 7 — Invoices & Payments

Phases 1–6 are live (bookings, grooming, hotel, mobile vans, transport, daycare). Next up per the roadmap: turn completed services into invoices, capture payments, and give the operator a clean AR view. Sidebar already has **Invoices & Payments** at `/admin/invoices`.

### What we'll build

1. **Invoices list at `/admin/invoices`**
   - Table of invoices with number, customer, issue date, due date, total, amount paid, status chip (`draft`, `sent`, `part_paid`, `paid`, `overdue`, `void`).
   - Filters: status, customer, date range, "unpaid only".
   - Top stat cards: Outstanding total (ZAR), Overdue count, Paid this month, Drafts.
   - Row click → invoice detail.

2. **Invoice detail at `/admin/invoices/:id`**
   - Header: number, customer, issue/due dates, status, totals.
   - Line items table: description, qty, unit price, VAT, line total. Add/remove/edit lines while `draft`.
   - Linked bookings section (auto-pulled + manually addable).
   - Payments log (date, method, amount, reference) with "Record payment" action.
   - Actions: **Save draft**, **Issue** (locks lines, sets number + issue date, queues email via `notification_events`), **Mark paid**, **Void**, **Download PDF** (deferred stub), **Send reminder**.

3. **Create invoice flows**
   - From customer detail: "New invoice" → pre-fills customer, offers list of their un-invoiced completed bookings to bulk-add as lines.
   - From bookings page (single or multi-select on completed rows): "Invoice selected" → drawer to pick/create invoice.
   - Standalone "New invoice" button on the list.

4. **Payments**
   - Manual "Record payment" (cash, EFT, card-manual, other) with amount, date, reference, notes; updates invoice `amount_paid` and status.
   - Payments tab within the same page (`/admin/invoices?tab=payments`) — flat list of all payments across invoices, filterable.
   - Provider integration (PayFast / Yoco / Stripe) is **deferred to Phase 7b**; this phase is manual capture only, but the schema supports a `provider` column.

5. **Booking → invoice glue**
   - Booking detail gets an "Invoice" panel: shows linked invoice (if any) with status chip + link, or "Create invoice" button for completed bookings.
   - When a booking is cancelled, its invoice line is flagged (not auto-removed); operator decides.

6. **Settings-first (per Core rule)**
   - **Invoice settings** page at `/admin/settings/invoicing` (permission `settings.invoicing.manage`): company details (name, VAT no., address, banking), invoice number prefix + next number, default payment terms (net days), default VAT rate, footer / notes text, reminder cadence (days after due).
   - **Payment methods** page at `/admin/settings/payment-methods` (same permission): toggle which manual methods are available (cash/EFT/card-manual/other) and add custom labels.

### Out of scope (deferred)

- Online payment gateway integration (PayFast/Yoco/Stripe) — Phase 7b.
- PDF rendering — stub button only; wire real PDF in 7b.
- Statements, credit notes, refunds — later.
- Recurring / subscription invoices for daycare enrolments — Phase 7c once monthly billing rules are agreed.
- Customer portal invoice view — Phase 8 (portal).

### Files (planned)

- `src/features/invoices/InvoicesListPage.tsx`, `InvoiceDetailPage.tsx`, `InvoiceLineEditor.tsx`, `RecordPaymentDialog.tsx`, `NewInvoiceDrawer.tsx`, `PaymentsListPage.tsx`, `queries.ts`, `status.ts`
- `src/features/bookings/BookingInvoicePanel.tsx` (embedded in BookingDetailPage)
- `src/features/customers/CustomerInvoicesPanel.tsx` (embedded in CustomerDetailPage)
- `src/features/settings/InvoicingSettingsPage.tsx`, `PaymentMethodsPage.tsx`
- Migration: `invoices`, `invoice_lines`, `invoice_payments`, `invoicing_settings`, `payment_methods` tables (all tenant-scoped, GRANTs + RLS + `updated_at` triggers). New permission `settings.invoicing.manage`, granted to roles that already have `settings.daycare.manage` / `settings.vans.manage`. New permissions `invoices.view`, `invoices.manage`, `invoices.record_payment` granted to existing operator/admin roles.
- Route wiring in `src/App.tsx` and Settings index links; sidebar already points at `/admin/invoices`.

### Verification

- Complete a booking → open it → "Create invoice" pre-fills a line for the service at the correct price → issue it → status becomes `sent` and a `notification_events` row is written.
- Record a partial payment → status flips to `part_paid`; record the remainder → `paid`.
- List filters (overdue, unpaid, by customer) return the expected rows; stat cards match.
- Change invoice prefix in Settings → next issued invoice uses the new prefix.
- Non-admin without `invoices.manage` sees the list but cannot issue, void, or edit lines. Non-admin without `settings.invoicing.manage` cannot open the two new Settings pages.

Shall I proceed with Phase 7 as above?
