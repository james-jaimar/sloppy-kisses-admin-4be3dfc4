---
name: Invoicing hardening roadmap
description: Sequenced sections A1→E1 for invoicing improvements; tracks what's done and what's next
type: feature
---
# Invoicing hardening — sequenced roadmap

Work top-to-bottom. After finishing a section, tick it here and start the next.
Scope excludes full accounting (Xero owns VAT engine, period locks, journal audit).

## Sections

- [ ] **A1** — Granular invoicing permissions + RLS split
  - Perms to add: `invoices.send`, `invoices.void`, `invoices.delete`, `payments.refund`, `credit_notes.issue`, `credit_notes.refund`
  - Split `invoices_staff_all` / `invoice_items_staff_all` / `payments_staff_all` into per-cmd policies via `user_has_permission()`
  - Frontend gates on List/Detail/Drawer/Dialog
- [ ] **A2** — Lock-after-send + `invoice_events` audit table + Activity tab
- [ ] **B1** — Email delivery (`sent_at`, `viewed_at`, `send-invoice-email` edge fn, Send/Mark-as-sent UI)
- [ ] **B2** — Reminder dispatcher (pg_cron → `send-invoice-reminders`), `reminders_paused` flag
- [ ] **C1** — Credit notes (table, numbering, apply-to-invoice, PDF)
- [ ] **C2** — Refunds against payments (`refund_of_payment_id`, negative amount, links to CN)
- [ ] **C3** — Over-payments → `customer_credit_ledger`, allocation
- [ ] **C4** — Statements of account + aging report (30/60/90+) with CSV
- [ ] **D1** — Online "pay now" via Stripe (Lovable Payments), hosted checkout link on emailed invoice + portal
- [ ] **D2** — Recurring invoices + bulk list actions (multi-select send/mark-paid/PDF)
- [ ] **E1** — Xero CSV export (Sales Invoices import format), respects xero_invoice_number

## Continuity protocol
1. Finish a section → tick its box in this file.
2. Ping user: "Section X done, Y is next — proceed?"
3. Do NOT auto-advance without user confirmation.

## Rationale for order
Permissions/audit gate everything money-touching. Email before reminders. Credit notes before refunds. Credit balance before statements. Online pay uses email link. Xero export last so schema is stable.
