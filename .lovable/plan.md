# Why bookings still show "Confirmed"

## What I checked

- Both new triggers exist and are enabled: `bookings_payment_gate_trg` on `bookings`, `invoices_release_payment_holds_trg` on `invoices`.
- The bookings on your screen (BK00242, BK00238, BK00237, BK00245, BK00243…) all have `status = confirmed`, `payment_hold_expires_at = NULL`, and issued invoices with `amount_paid = 0` and a full balance outstanding.

## Cause

The gate only runs when a booking row is inserted or updated. Every booking currently in the list was confirmed before the gate existed, so nothing has re-evaluated them. There was no backfill step, so the historic rows kept their old status.

## Fix

1. One-off backfill: move existing bookings to "Awaiting payment" where all of the following hold — status is `confirmed`, the service's workflow settings require payment to confirm, the booking is still in the future (not checked in/out, completed or cancelled), and `booking_payment_satisfied()` returns false. Set `payment_hold_expires_at` from the service's hold hours, counted from now (not from the original booking date), so nothing gets auto-released the instant the hourly job runs.
2. Leave past/in-progress bookings alone — retro-holding a stay that already happened would be wrong.
3. Log each change into `booking_status_events` with a clear reason so the history explains the mass status shift.
4. Re-check afterwards that paid bookings (BK00240, BK00239) stay `confirmed` and that unpaid ones now read "Awaiting payment" in the bookings list.

## Technical notes

- Backfill runs as a single SQL migration using the existing `booking_payment_gate()` / `booking_payment_satisfied()` helpers, so the rules stay in one place.
- Hold expiry: `now() + (payment_hold_hours || ' hours')::interval`, per service settings.
- No frontend changes needed — the badge and portal banner for `pending_payment` are already in place.
