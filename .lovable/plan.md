## Goal

Match Charlotte's real-world practice:

- Invoicing run on the **22nd/23rd** of each month, covering **the following month**.
- Payment due by the **1st** of that following month.
- Each invoice covers a specific **billing period** (e.g. "August 2026") so it's obvious to customer and staff what month is being paid for.
- Then re-label all 95 current draft invoices from "July daycare" to "August daycare" so today's testing lands correctly.

## Part 1 — Billing period on invoices

Add to `public.invoices`:

- `billing_period_start date` (nullable)
- `billing_period_end date` (nullable)

Add to `public.invoicing_settings`:

- `billing_cycle text` — `'monthly_prepaid'` (default) or `'ad_hoc'`
- `billing_run_day smallint` — day of month the run happens (default 22)
- `billing_due_day smallint` — day of the covered month payment is due (default 1)

Settings screen (`InvoicingSettingsPage.tsx`) gets a new "Billing cycle" card exposing all three, with the same permission gating as the other blocks.

## Part 2 — Auto-invoice grouping keyed on billing period

Change `ensure_draft_invoice(tenant, customer)` → `ensure_draft_invoice(tenant, customer, period_start, period_end)`:

- Reuses the customer's open draft **only if** its `billing_period_start/end` match the requested period.
- Otherwise creates a new draft stamped with that period, `issue_date = period_start - interval '9 days'` (i.e. the 22nd of the previous month when period starts on the 1st), `due_date = period_start` (the 1st), title/notes: "Daycare — <Month YYYY>".

Update the four auto-invoice triggers (`daycare_enrolments_auto_invoice`, hotel, grooming, transport) so each computes the target period for the row it's inserting and passes it to `ensure_draft_invoice`:

- Daycare enrolment created today (20 Jul) → target period = **August 2026** (next month, since we're past the "billing_run_day" cutoff or by policy: enrolments always bill the *next* whole month).
- Hotel / grooming / transport bookings → period = the month the booking's `start_at` falls in (they're event-based, not subscription-based).

For daycare specifically the rule is "always bill next month" until a proper period-generator job exists.

## Part 3 — One-off migration to shift the current 95 drafts to August

The existing 95 draft invoices (R237,400 total) were generated as "current" but represent August prepaid daycare per Charlotte's cycle. Migration steps:

1. For every existing `draft` invoice, set `billing_period_start = 2026-08-01`, `billing_period_end = 2026-08-31`, `issue_date = 2026-07-22`, `due_date = 2026-08-01`.
2. For daycare-sourced invoice line descriptions currently reading `Daycare — <plan> (<pet>)`, append ` — Aug 2026` if not already period-tagged.
3. Leave totals untouched.

Run via `supabase--insert` after schema migration is approved, so descriptions/dates line up with the new fields.

## Part 4 — Monthly billing run (foundation only, no cron yet)

Add RPC `public.generate_monthly_daycare_invoices(p_tenant_id uuid, p_period_start date)`:

- For every active `daycare_enrolments` row overlapping `p_period_start … (p_period_start + 1 month - 1 day)`, ensure a line exists on that customer's period draft.
- Idempotent — uses `(source_type='daycare_enrolment', source_id=enrolment.id, billing_period_start)` uniqueness check on `invoice_items`.
- Returns `{ created_invoices int, added_lines int }`.

Expose in Settings → Invoicing as a "Run monthly billing" button (permission: `invoicing.run_monthly`). No cron yet — Charlotte clicks it on the 22nd. Cron can be added later without changing the RPC.

Add invoice-items uniqueness helper: unique partial index on `(invoice_id, source_type, source_id)` where `source_type = 'daycare_enrolment'` — prevents duplicate lines if the run is clicked twice.

## Part 5 — UI surfacing

- Invoice list & detail: show a "Aug 2026" pill next to the invoice number when `billing_period_start` is set.
- Customer portal invoice list: same pill.
- Draft grouping toast on enrolment already fires — no change needed.

## Technical notes

- All schema in one migration; then a data migration via `supabase--insert` to backfill the 95 drafts.
- `invoices_lock_after_send` guard stays as-is (it was fixed last turn).
- No changes to hotel/grooming/transport UX besides the invoice pill — their bookings continue to auto-invoice per event, just now stamped with their event month.
- Permissions: reuse `invoicing.settings.edit` for the new settings block; add `invoicing.run_monthly` for the run button.
- Skips retroactive changes to sent/paid invoices (they won't exist yet on this tenant, but the migration filters `status = 'draft'` regardless).

## Open question

I'll assume "always bill next month" for new daycare enrolments regardless of the day — simplest and matches "test today, lands on August". If you want the trigger to look at `billing_run_day` (before the 22nd = current month, on/after 22nd = next month), tell me and I'll swap the rule.
