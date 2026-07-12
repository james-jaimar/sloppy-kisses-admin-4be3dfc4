
## Section C2 — Refunds against payments (PayFast-ready)

Records money going back to the customer against a specific payment (or standalone). Typically triggered after a credit note is issued, but the money-out leg lives here. Wired so that when PayFast is connected later, we flip a switch — no schema churn.

### What ships now

**Database — new `payment_refunds` table**
- `tenant_id`, `payment_id` (nullable — allows off-system refunds), `invoice_id` (nullable, denormalised for reporting), `credit_note_id` (nullable — link the paperwork), `customer_id`
- `amount` `numeric(12,2)`, `currency` (default ZAR), `refund_date`
- `method` — reuses existing `payment_methods` list (cash, EFT, card, etc.) so refunds match the original payment channel
- `reference` — free-text (e.g. bank txn ref, PayFast refund id echoed here)
- `status` — enum `pending` / `processing` / `succeeded` / `failed` / `cancelled` (manual refunds jump straight to `succeeded`; gateway refunds start `pending`)
- `notes`
- **Gateway fields (dormant until PayFast wired):** `provider` (text: `manual` / `payfast` / `yoco` / `stripe`), `provider_refund_id`, `provider_status`, `provider_payload` (jsonb — raw callback body), `provider_error`
- `created_by`, `updated_by`, timestamps

**Database — supporting**
- Extend `payments` with `amount_refunded numeric(12,2) default 0` and `refund_status` (`none` / `partial` / `full`) — kept in sync by trigger.
- Trigger on `payment_refunds`: on `succeeded` insert/update, bump `payments.amount_refunded`, recompute `refund_status`, reduce the linked invoice's `amount_paid` and increase `balance_due` (mirror of payment application, atomic). Flip invoice status back to `part_paid` / `sent` as appropriate.
- Guard: `sum(refunds.amount where succeeded) <= payments.amount` per payment.
- Audit hook: log `refund_recorded` / `refund_failed` / `refund_voided` into `invoice_events` against the linked invoice.
- New RPC `record_manual_refund(payment_id, amount, method, reference, credit_note_id, notes)` — atomic; used by the UI.
- New RPC `void_refund(refund_id)` — reverses a succeeded refund (creates a compensating adjustment; only allowed for `manual` provider or platform owner).

**Permissions** (added to A1's set)
- `refunds.view`, `refunds.create`, `refunds.void`
- Seeded to Owner (all) and Manager (all); Worker gets `view` only.

**Gateway abstraction (scaffolding only — no PayFast keys required today)**
- New `payment_providers` table: `tenant_id`, `provider` (text), `enabled` (bool), `mode` (`test` / `live`), `settings` (jsonb — merchant id, passphrase-ref, etc. — never the secret itself), `webhook_secret_ref` (name of the Supabase secret to look up at runtime). One row per tenant per provider.
- Edge function skeleton `payment-gateway-refund` — dispatches on `provider`:
  - `manual` → immediately writes a `succeeded` refund row (used by the UI today).
  - `payfast` → stub that returns `501 Not Implemented` with a clear message. When PayFast is signed up: fill in the ITN-verified refund call, secrets loaded from `Deno.env` via `webhook_secret_ref`. **No secrets touched now.**
  - `yoco` / `stripe` → same stub shape.
- Edge function skeleton `payment-gateway-webhook` — verifies signature per provider, updates `payment_refunds.status` + `provider_payload`. Stubbed today.
- Admin → Settings → **Payment providers** page (gated by new `settings.payment_providers` permission) — lists providers with an Enable toggle, mode selector, and a "Coming soon — PayFast recommended" info banner. Editing is disabled for gateway providers until the connect flow is built; you can already toggle `manual` (which is on by default).

**Frontend — refunds UI**
- Payment detail area (inline in Invoice Detail page's Payments card): each payment gets a "Refund" button (gated by `refunds.create`) opening a drawer:
  - Amount (pre-filled with remaining refundable), method (default = original method), reference, optional link to a credit note (dropdown of open CNs for that customer), notes.
  - On submit → calls `record_manual_refund` RPC (today) or `payment-gateway-refund` edge function (once a gateway is enabled).
- Payments card now shows per-payment refunded amount + status pill, and a "Refunded" line in the totals block.
- Credit Note detail page: new "Refunds" tab listing refunds linked to this CN (many-to-one), with a "Record refund" button that pre-fills the linked payment picker.
- Invoice Detail page: activity feed picks up new `refund_*` events automatically.
- Sidebar: no new top-level entry — refunds live inside payments/invoices/credit notes.

### Out of scope for C2 (deliberate)
- Actual PayFast HTTP calls / signature verification — stubs land now, real implementation is a small follow-up once Charlotte signs up (add secret + fill two functions).
- Yoco / Stripe integrations.
- Over-payment / customer credit balance (that's C3).
- Bulk refund of a whole invoice (user records refunds per payment; a "refund all" convenience button can come later).

### Technical details
- Money math and status flips live in DB triggers so a manual UI insert and a future gateway callback produce identical downstream state.
- Provider secrets stored via Supabase secrets, referenced by name in `payment_providers.webhook_secret_ref`. Nothing sensitive in the DB.
- Idempotency: `payment_refunds` gets a unique index on `(provider, provider_refund_id)` where provider ≠ `manual`, so PayFast webhook retries don't double-refund.
- All money columns `numeric(12,2)`; refund sums enforced server-side.
- Existing `payments.amount` remains immutable — refunds are additive rows, never mutations of the original payment.

### Sequenced work
1. Migration: `payment_refunds`, `payment_providers`, `payments` columns, enums, triggers, RPCs, permissions, GRANTs.
2. Types regen → refund query hooks (`useRefunds`, `useRecordManualRefund`, `useVoidRefund`).
3. Refund drawer + Payments card refresh on Invoice Detail.
4. Credit Note detail "Refunds" tab.
5. Edge function stubs `payment-gateway-refund` + `payment-gateway-webhook` (manual path live; PayFast returns 501).
6. Admin → Settings → Payment providers page (list + toggle for manual; PayFast row visible but disabled with "Coming soon").
7. Tick C2 in `mem://features/invoicing-roadmap.md`; note PayFast follow-up items.

Give the word and I'll kick off with the migration.
