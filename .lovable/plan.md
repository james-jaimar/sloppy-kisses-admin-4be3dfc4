## Goal

When a new daycare enrolment or a new hotel / grooming / transport booking is created (from anywhere — admin UI, portal wizard, or API), the system automatically creates a **draft invoice** for that customer, pre-filled with the correct line items where price data exists. Staff review and click Issue.

Nothing currently does this — no trigger, no client-side call — so the "auto trigger" for Tracy's new enrolment simply doesn't exist yet. This plan builds it.

## Why draft, not issued

- Once an invoice moves to `sent` it's locked (existing `invoices_lock_after_send` trigger). Auto-issuing removes the staff's chance to tweak add-ons, tip a surcharge, waive a fee, etc.
- Hotel and transport currently have no per-night / per-trip price on the details row, so their auto-line will be a $0 placeholder that a human must price before issuing.

## Trigger design (DB-side, one function per service)

All triggers run `SECURITY DEFINER` with `search_path=public`, mirror the pattern of `bookings_notify_changes`, and short-circuit if an invoice is already linked (idempotent — safe for re-runs / booking updates).

Common helper: `public.ensure_draft_invoice(tenant_id, customer_id) → invoice_id`
- Reuses the customer's existing open draft for that tenant if one exists (so multiple same-day enrolments roll into one draft), otherwise creates a new draft via `next_invoice_number`.

### 1. Daycare — `daycare_enrolments AFTER INSERT`
- Look up `daycare_plans` (name, price, billing_period, days_per_week).
- Call `ensure_draft_invoice`.
- Insert one `invoice_items` line: description `"Daycare — {plan.name} ({pet.name})"`, qty 1, unit_price `plan.price`.
- Leave `bookings.invoice_id` untouched (enrolments aren't bookings). Store the invoice link back on the enrolment via a new nullable `invoice_id` column on `daycare_enrolments`.

### 2. Grooming — `grooming_booking_details AFTER INSERT`
- Look up parent booking + `grooming_packages` for `price_zar`.
- Create draft invoice, insert package line + surcharge lines (`travel_fee`, `matted_surcharge_zar`, `sedation_surcharge_zar`) where > 0.
- Set `bookings.invoice_id`.
- Separate `grooming_booking_addons AFTER INSERT` trigger appends add-on lines to the same invoice (looks up the booking's `invoice_id`, appends via `invoice_items` — the existing `recompute` trigger keeps totals in sync).

### 3. Hotel — `hotel_booking_details AFTER INSERT`
- Create draft, insert one placeholder line: description `"Hotel stay — {nights} nights ({pet.name})"`, qty = nights, unit_price 0.
- Set `bookings.invoice_id`. Staff prices before Issue.

### 4. Transport — `transport_details AFTER INSERT`
- Create draft, insert placeholder `"Transport — {direction}"` line at 0.
- Set `bookings.invoice_id`.

### 5. Settings toggle (settings-first rule)
- Add columns to `invoicing_settings`: `auto_invoice_daycare bool default true`, `auto_invoice_hotel bool default true`, `auto_invoice_grooming bool default true`, `auto_invoice_transport bool default true`.
- Each trigger reads the flag and no-ops if disabled.
- New card in `InvoicingSettingsPage.tsx` with 4 switches so Charlotte can turn any of them off without a developer.

## Frontend touches

- `EnrolmentDrawer.tsx` — after successful save, toast now says "Enrolment created. Draft invoice #INVxxxxx" and links to it (reads the new `enrolment.invoice_id`).
- `BookingInvoicePanel.tsx` — already shows the linked invoice, so hotel / grooming / transport bookings will just work.
- `InvoicingSettingsPage.tsx` — add the 4-toggle "Auto-invoicing" card.

## Explicitly out of scope

- Back-filling the invoice for Tracy's new enrolment (user said no).
- Auto-issuing (staff still clicks Issue).
- Recurring / monthly billing rollups — that's a separate feature.
- Any change to booking-request → booking approval flow (invoice will fire at the booking-created step downstream).

## Files / migrations

1. Migration: add `daycare_enrolments.invoice_id uuid`, add 4 `auto_invoice_*` flags to `invoicing_settings`, create `ensure_draft_invoice`, create 5 triggers.
2. `src/features/invoices/queries.ts` + `InvoicingSettingsPage.tsx` — surface the toggles.
3. `src/features/daycare/queries.ts` + `EnrolmentDrawer.tsx` — read/show the new `invoice_id` and link to the invoice from the success toast.
