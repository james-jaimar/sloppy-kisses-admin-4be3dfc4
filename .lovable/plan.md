
# Instant bookings, immediate invoicing, and the monthly daycare run

Goal: customers book directly (no "request" middle step), the booking is confirmed on the spot, an invoice is issued immediately, and they either pay online via PayFast or by EFT with a proof-of-payment upload. Daycare stays on the monthly prepaid cycle with an admin-run billing batch.

## What's already there (verified)

- `booking_requests` table + portal wizards (hotel, daycare, grooming in-house/mobile, transport) that all write a `pending_review` request, plus the admin queue and `convert.ts` mapper.
- Auto-invoice triggers per service (`grooming_details_auto_invoice`, `hotel_details_auto_invoice`, `transport_details_auto_invoice`, `daycare_enrolments_auto_invoice`) writing into an open **draft** invoice via `ensure_draft_invoice`.
- `generate_monthly_daycare_invoices(tenant_id, period_start)` RPC, currently triggered from a button on the Invoicing settings page.
- PayFast checkout (`portal-invoice-checkout`) + webhook, and per-tenant credentials in `payment_providers`.
- `documents` already has `booking_id`, so proof of payment can attach to a booking.
- `GroomingSlotPicker` + `grooming_day_availability` RPC for real availability.

## 1. Booking flow: request → real booking

Portal wizards stop writing `booking_requests`. Each wizard calls a new `portal-create-booking` edge function that, in one transaction:

1. Re-validates lead time, pet ownership, vaccination gate and (grooming) slot availability server-side.
2. Creates the `bookings` row with `status = 'confirmed'` and `source = 'customer_portal'`, plus the typed `*_booking_details` row.
3. Prices it from the existing rate cards / packages / add-ons and issues an invoice (status `issued`, not draft) for that booking.
4. Returns `{ booking_id, invoice_id }` so the portal lands the customer straight on a "Booking confirmed — pay now" screen.

Per service:

- **Grooming (in-house + mobile)** — slot picker, package, instructions, add-ons; priced exactly as the admin modal does today. Mobile adds the suburb travel fee.
- **Hotel / cattery** — dates, pets, accommodation type; priced from `hotel_rate_cards` with multi-pet and size gating; surcharges (e.g. late checkout) added as selected.
- **Pickup / drop-off** — priced from transport workflow settings, one-way vs round trip.
- **Daycare** — a portal submission creates the **enrolment** (not a per-day booking), start date defaulted to the 1st of the next billing month. It is **not** invoiced immediately; it flows into the monthly run below. This is the one service where "book now, pay now" doesn't apply because it's a recurring monthly product.

`booking_requests` is retired: the sidebar entry, badge, admin queue, portal "Requests" page and `convert.ts` are removed; the table stays in the database (read-only history) so existing rows aren't lost. Cancellation/change requests move to a simple "Request a change" action on the booking that raises a comms message to staff instead of a queue item.

## 2. Payment state on a booking

Booking is confirmed straight away; payment is tracked separately and shown clearly.

- Add a derived **payment badge** on every booking (admin + portal) driven by the linked invoice: `Unpaid` / `Proof uploaded` / `Part paid` / `Paid`. Unpaid bookings past their start date show an amber warning on the board.
- Portal booking detail gets a **Pay now** button (PayFast, reusing `portal-invoice-checkout`) and, alongside it, EFT banking details from `payment_methods`.
- **Proof of payment upload** — new document type `proof_of_payment`, uploaded from the portal booking/invoice page, attached to both `booking_id` and `invoice_id`. Uploading sets the booking's payment badge to "Proof uploaded" and raises a notification event for the accounts inbox. Admin reviews it on the invoice page and either records the payment (existing Record payment dialog) or rejects it with a reason.
- PayFast success continues to write the payment through the webhook, which flips the badge to Paid automatically.

## 3. Settings-driven lead time

New per-service workflow setting **Minimum booking lead time (hours)**, default 24, editable on each existing workflow settings page (Grooming, Hotel, Transport). Effects:

- The portal slot picker / date picker refuses anything inside the window.
- The edge function re-checks it (client can't bypass).
- Admin booking modal is exempt but shows a "short notice" hint.
- Second setting per service: **Require payment or proof of payment for bookings inside the lead window** (default on). When on, a short-notice portal booking must complete PayFast or upload proof before submit; otherwise it can't be created.

## 4. Daycare monthly billing run

New admin screen **Invoices → Billing run** (permission-gated), replacing the bare button on the Invoicing settings page:

1. Pick the billing period (defaults to next month, following `billing_run_day` = 22 and `billing_due_day` = 1).
2. **Preview** — table of every active enrolment: customer, pets, plan, days/week, computed amount, and whether an open draft already exists for that period. Totals at the top. Rows can be excluded from this run.
3. **Generate** — runs `generate_monthly_daycare_invoices` for the selected rows, then shows the created/updated invoices.
4. **Issue & send** — bulk-issue the batch (status `issued`, due date = the 1st) and email them with the pay link, reusing the existing invoice email + reminder pipeline.
5. Run history so it's obvious the 22nd was done.

## Technical notes

- Database: add `min_lead_hours` + `require_prepayment_short_notice` to `grooming_workflow_settings`, `hotel_workflow_settings`, `transport_workflow_settings`; add `proof_of_payment` to the document type list; add a `payment_status` view/helper joining bookings to their invoice; add a `billing_runs` table for run history. Auto-invoice trigger functions get a flag so portal-created bookings issue their invoice instead of appending to a draft.
- New edge function `portal-create-booking` (JWT-validated, Zod-validated body, service-role writes) holds all pricing/validation so the portal can't set its own price.
- Existing draft-invoice behaviour for **admin-created** bookings is unchanged — only portal bookings issue immediately.
- Every new setting ships with its Settings CRUD screen, per the settings-first rule.

## Suggested build order

1. Settings + schema (lead time, prepayment flag, proof-of-payment type, billing_runs).
2. `portal-create-booking` with grooming first, portal grooming wizard switched over end to end (book → invoice → PayFast → confirmed).
3. Hotel and transport wizards onto the same function; daycare wizard → enrolment.
4. Proof-of-payment upload + admin review; payment badges on boards.
5. Billing run screen.
6. Retire the booking-request UI once nothing writes to it.
