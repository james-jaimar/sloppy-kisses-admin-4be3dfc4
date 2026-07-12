
## Section C1 — Credit notes

Next up in the roadmap. Credit notes let you reverse part or all of a locked (issued/paid) invoice without editing the original — the correct accounting move once an invoice has been sent. This section is the prerequisite for C2 (refunds) and C4 (statements).

### What ships

**Database**
- New `credit_notes` table: tenant_id, credit_note_number, customer_id, invoice_id (nullable — allows "standalone" credit for goodwill), status (`draft` / `issued` / `applied` / `cancelled`), issue_date, subtotal, total, amount_applied, balance, reason, notes, xero_* fields, created_by/updated_by, timestamps.
- New `credit_note_items` table: credit_note_id, description, quantity, unit_price, line_total, sort_order — mirrors `invoice_items`.
- New `credit_note_applications` table: credit_note_id, invoice_id, amount, applied_at, applied_by — records which invoices a credit was applied against (many-to-many so one CN can cover multiple invoices).
- `invoicing_settings`: add `credit_note_prefix` (default `CN-`) and `next_credit_note_number` (default 1).
- `next_credit_note_number(tenant_id)` RPC mirroring `next_invoice_number`.
- Trigger to recompute CN totals on item change (mirror of invoice totals trigger).
- Trigger on `credit_note_applications` insert/delete: bumps `credit_notes.amount_applied` + `balance`, and reduces the target invoice's `balance_due` (and flips invoice status → `paid` when balance hits zero, same as a payment).
- Lock-after-issue trigger on `credit_notes` / `credit_note_items` (same shape as invoice lock).
- Audit hook: log `credit_note_issued`, `credit_note_applied`, `credit_note_cancelled` into `invoice_events` against the target invoice(s).
- RLS + GRANTs gated by new permission codes below.

**Permissions** (added to A1's set)
- `credit_notes.view`, `credit_notes.create`, `credit_notes.issue`, `credit_notes.apply`, `credit_notes.void`.
- Seeded onto Owner (all) and Manager (all except `void`); Worker gets `view` only.

**Frontend**
- New route `/admin/credit-notes` — list page (number, customer, date, total, balance, status chip).
- New route `/admin/credit-notes/:id` — detail page: header, line-item editor (draft only), Apply-to-invoice picker (lists customer's open invoices with balance), applications list, Activity feed (reuses invoice_events reader), PDF download.
- New drawer "Issue credit note" launched from the invoice detail page ("Issue credit note" button, gated by `credit_notes.create`) — pre-fills customer + invoice link, lets user pick full-invoice reversal or custom lines.
- Invoice detail page: show "Credits applied" row alongside Paid/Balance, and list linked CNs.
- Sidebar: add "Credit notes" under Invoices, gated by `credit_notes.view`.

**PDF**
- New edge function `generate-credit-note-pdf` — reuses layout from `generate-invoice-pdf` (same header/footer/branding, "CREDIT NOTE" banner, references the original invoice number).
- Downloadable from CN detail page; not emailed in C1 (email attach + share link comes in a later slice if you want).

**Out of scope for C1** (deliberate — keeps this shippable):
- Refunds against payments (that's C2 — often triggered by issuing a CN, but the money-out leg lives there).
- Over-payment / customer credit balance (C3).
- Emailing CNs to customers (can bolt on later; PDF download covers the immediate need).

### Technical details

- Numbering uses the same advisory-lock pattern as invoices to prevent race conditions.
- Applying a CN to an invoice is a single RPC (`apply_credit_note(cn_id, invoice_id, amount)`) that: validates amount ≤ min(CN balance, invoice balance), inserts the application row, and lets the trigger cascade. Kept server-side so the balance math is atomic.
- Voiding an issued CN with applications is blocked — user must first reverse the applications (delete rows), which the trigger will restore invoice balance for.
- All money columns are `numeric(12,2)`; totals recomputed from items server-side (never trust client).

### Sequenced work

1. Migration: tables + RPCs + triggers + permissions + GRANTs.
2. Types regen, then query hooks (`useCreditNotes`, `useCreditNote`, `useIssueCreditNote`, `useApplyCreditNote`, `useVoidCreditNote`).
3. List page + detail page + issue drawer.
4. Invoice detail integration (button + credits-applied row).
5. `generate-credit-note-pdf` edge function.
6. Sidebar + roadmap memory tick.

Say the word and I'll kick off with the migration.
