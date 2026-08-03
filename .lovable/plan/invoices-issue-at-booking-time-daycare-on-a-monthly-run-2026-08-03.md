# Invoices: issue at booking time, daycare on a monthly run

## What changes

Today every service quietly adds lines to a shared **draft** invoice per customer (hotel/transport group by month, grooming into an open draft), and daycare invoices the moment an enrolment is created. That gets replaced with:

- **Hotel, cattery, grooming, transport, stay & play:** creating a booking creates its **own full invoice** for that booking, immediately **issued** (not draft), with invoice number, issue date and due date, then **emailed** to the customer automatically.
- **Daycare:** no invoice on enrolment at all. Daycare is billed only by the **manual monthly run** the admin does around the 22nd for the coming month.
- **Existing non-daycare drafts:** all issued as proper invoices in a one-off cleanup.

## Booking-level invoicing

1. Each booking gets exactly one invoice. All its lines (package, nights, extra pet, surcharges, add-ons, travel fee, matted/sedation, stay & play, late-notice fees) live on that invoice — nothing is merged into another customer invoice.
2. The invoice is created with status `issued`, due date driven by the existing payment-terms setting.
3. While a booking is still being edited before the invoice is emailed/paid, price changes re-price the same invoice. Once it has been sent or paid, the invoice is locked (existing rule) and changes must go through a credit note or a follow-up invoice — an add-on captured at check-out will therefore create a small second invoice for that booking rather than silently altering a sent one.
4. Cancellations keep the existing behaviour: cancelling a paid/sent booking produces a credit note, not a deleted invoice.

## Automatic emailing

- On issue, the invoice is queued to the customer through the existing invoice email path (PDF attached), respecting the global send kill-switch and test allowlist. While sending is paused, the invoice is still fully issued and visible in the portal, and it flushes to the customer when sending is re-enabled.
- Every send is recorded in the invoice's event history, so staff can see when it went out and resend from the invoice page.

## Daycare monthly run

- Enrolment creation stops touching invoices.
- The existing monthly run stays the admin's tool, upgraded so it: targets the coming month, shows a preview of customers/lines/total before committing, creates one invoice per customer for that period, and issues + emails them in the same action.
- Settings already hold the run day (22nd) and due day (1st); the run screen defaults to those and gets a "coming month" preset plus a record of past runs.

## Existing drafts cleanup

A one-off pass over current non-daycare draft invoices: assign issue/due dates and set them to issued. Daycare-period drafts are left untouched so the monthly run stays the source of truth for them. These are not auto-emailed — staff can send them from the invoice list.

## Technical notes

- Rework `grooming_details_auto_invoice`, `hotel_details_auto_invoice`, `transport_details_auto_invoice` and the add-on/surcharge triggers to use a new `ensure_booking_invoice(booking_id)` helper that creates a per-booking `issued` invoice instead of `ensure_draft_invoice`, and re-price against that invoice only.
- Drop the `daycare_enrolments_auto_invoice` trigger; keep and extend `generate_monthly_daycare_invoices` (add preview mode + issue/email step, log to `billing_runs`).
- Emailing goes through the existing `send-invoice-email` function plus `mark_invoice_sent`, called after issue; guarded by `comms_settings.sending_enabled`.
- Invoice-locking triggers stay as-is; issued (not yet sent) invoices remain editable, which is what allows re-pricing during booking edits.
- Frontend: booking detail and portal show the linked invoice with a pay/download action instead of "draft pending"; invoices list gains a monthly-run entry point for daycare.
