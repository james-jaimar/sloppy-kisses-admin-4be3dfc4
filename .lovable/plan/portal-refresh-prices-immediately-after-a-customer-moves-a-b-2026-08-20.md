# Portal: refresh prices immediately after a customer moves a booking

## Problem

When a customer moves a booking from the portal, the booking dates update on screen but the money does not — the hotel price strip and invoice figures keep showing the old amounts until the customer leaves the page and comes back (which remounts and refetches everything).

## Cause

The Move/Cancel modal refreshes only three caches after the change succeeds:

- the booking record
- the bookings list
- the dashboard "upcoming" widget

The pricing on that same page is served by separate caches that are never told to refresh: the hotel money strip, the invoice detail, the invoices list and credit notes. The database does reprice correctly at the moment of the move — it is purely a stale-cache display problem on the portal.

## Changes

1. After a successful move or cancel, refresh every money-related cache for that booking as well: hotel money strip, invoice detail, invoices list, credit notes, and payment options.
2. Wait for the booking + money refetch to finish before the modal closes, so the customer sees the new figures the instant the dialog disappears instead of a flash of old numbers.
3. Show a short "Updating your invoice…" state on the confirm button while that refetch runs, and surface the new total in the success toast (e.g. "Booking moved — invoice updated to R3 920").
4. Apply the same refresh set to the cancel path, since a cancellation can add a late-cancellation fee or produce a credit note.

## Technical detail

- `src/features/customerPortal/bookings/BookingChangeModal.tsx`: extend the `onSuccess` handler to invalidate `["hotel_money", bookingId]`, `["portal_invoices"]`, `["portal_invoice"]`, `["portal_credit_notes"]`, `["portal_payment_options"]` alongside the existing keys; `await` the booking/money invalidations before calling `onClose()`.
- No database or pricing-logic changes — the reprice triggers already run inside `portal_reschedule_booking` / `portal_cancel_booking`.
