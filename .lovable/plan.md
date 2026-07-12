## Invoicing hardening — full programme, sequenced

Working top-to-bottom through Slices A → E. Each slice ships as an approvable section; after each one lands I'll update `mem://features/invoicing-roadmap` so the next section is picked up automatically in a fresh session.

### Execution order (technical dependencies)

```text
A1  Granular permissions + RLS split           ← everything else gates on this
A2  Lock-after-send + invoice_events audit
──────────────────────────────────────────────
B1  Email delivery + sent_at/viewed_at         ← needs A2 (log sends as events)
B2  Reminder dispatcher (cron)                 ← needs B1
──────────────────────────────────────────────
C1  Credit notes                               ← needs A1/A2 (permission + audit)
C2  Refunds against payments                   ← needs C1 (refund often via CN)
C3  Over-payments / customer credit balance    ← needs C2 (share allocation code)
C4  Statements of account + aging report       ← needs C1+C3 (accurate balances)
──────────────────────────────────────────────
D1  Online "pay now" (Stripe via Lovable)      ← needs B1 (link goes in email)
D2  Recurring invoices + bulk list actions     ← independent; do after D1
──────────────────────────────────────────────
E1  Xero handoff (CSV export first, API later) ← last; needs stable data model
```

Rationale: permissions + audit must exist before we start changing money-touching behaviour, otherwise every later slice has to be retro-fitted with policy checks and event logging. Email precedes reminders (reminders send emails). Credit notes precede refunds (refunds usually issue a CN). Credit balance precedes statements (statements show it). Online pay uses the email link. Xero export goes last so we export a schema we're not still reshaping.

### Section deliverables (what each one includes)

Each section is a self-contained, shippable plan I'll present separately for approval:

- **A1 — Granular permissions**
  - New permission codes: `invoices.view`, `invoices.create`, `invoices.edit`, `invoices.send`, `invoices.void`, `payments.record`, `payments.refund`, `credit_notes.issue`, `credit_notes.refund`.
  - Seed into `permissions`, map to existing roles (Owner=all, Manager=most, Worker=view+create+record).
  - Split RLS on `invoices`, `invoice_items`, `payments` from the blanket `settings.invoicing.manage` to per-action policies via `user_has_permission()`.
  - Frontend: replace the single gate in `InvoicesListPage` / `InvoiceDetailPage` / `NewInvoiceDrawer` / `RecordPaymentDialog` with `<Can code="…">` per action; update `RolesPermissionsPage` (already exists, read-only — will auto-pick up new codes).

- **A2 — Lock-after-send + ops audit**
  - New `invoice_events` table (invoice_id, event_type, actor_profile_id, payload jsonb, notes, created_at) with RLS + grants.
  - DB trigger blocking edits to `invoices` / `invoice_items` when status ∈ ('sent','partial','paid','void') except through allowed columns (status transitions, xero_*, notes).
  - Log events on: create, edit-while-draft, send, mark-sent, void, payment recorded, payment refunded, CN issued/applied, reminder sent.
  - UI: "Activity" tab on `InvoiceDetailPage` rendering the timeline.

- **B1 — Email delivery**
  - Add `sent_at`, `last_sent_at`, `viewed_at`, `send_count` to `invoices`.
  - New edge function `send-invoice-email` that renders PDF (reuses `generate-invoice-pdf`), attaches, sends via existing SMTP (`email_transport_settings`), writes `email_log` + `invoice_events`, updates `sent_at`.
  - UI: "Send" button on invoice detail + "Mark as sent" for offline delivery; resend from Activity tab.
  - Public invoice view route hit-tracked to set `viewed_at`.

- **B2 — Reminder dispatcher**
  - `pg_cron` job (daily 08:00 SAST) invoking new `send-invoice-reminders` edge function.
  - Reads `invoicing_settings.reminder_days`, finds unpaid past-due invoices matching offsets, calls `send-invoice-email` in reminder mode, logs events.
  - Per-invoice `reminders_paused` flag + last-reminder timestamp to prevent double-sends.

- **C1 — Credit notes** — own table + numbering (`next_credit_note_number`), apply-to-invoice flow, PDF (reuse layout), permission-gated.
- **C2 — Refunds** — `refund_of_payment_id` on `payments`, negative amount, links to a CN.
- **C3 — Over-payments** — new `customer_credit_ledger`, allocate/consume, expose balance on customer detail.
- **C4 — Statements + aging** — per-customer statement PDF; aging report page (30/60/90+) with CSV export.

- **D1 — Online pay now** — Stripe via Lovable Payments connector; hosted checkout link on emailed invoice + customer portal.
- **D2 — Recurring + bulk** — `recurring_invoice_rules` table + generator cron; list-page multi-select for send / mark-paid / download.

- **E1 — Xero export** — CSV in Xero's "Sales Invoices" import format, filterable by date range + status, respects `xero_invoice_number` to avoid re-export; API sync flagged as follow-up.

### Session-to-session continuity

After each section lands I'll:
1. Update `mem://features/invoicing-roadmap` with a checklist marking that section ✅ and pointing to the next.
2. Reference it in `mem://index.md` under **Memories** so any new session immediately knows what's next.
3. Ping you with a one-line "Section X done, Y is next — want me to proceed?" so you stay in control of the cadence.

### Next step

I'll start with **Section A1 — Granular permissions**. That's a schema migration (seed permissions + swap RLS policies) plus a few frontend gate swaps. I'll write the memory file first, then present the detailed A1 plan for approval before touching anything.

No code changes yet.
