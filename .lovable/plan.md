## What's happening

Booking `BK00001` was created directly via **New booking** (not via a request). At creation time the modal loaded the customer's pets as togglable chips but nothing was pre-selected, so no rows were inserted into `booking_pets`. The DB confirms:

- `bookings.BK00001` → customer James Hawkins, `booking_request_id: null`, pet_count: **0**
- `pets` → Charlie (SP04983) is correctly linked to the same customer
- `booking_requests` → empty (this booking didn't come from a request)

So the schema and the customer→pet link are fine. The gap is purely in the booking-creation UX: pets are treated as optional and silently default to none.

## Fix (app-level guard so this never happens again)

1. **`src/features/bookings/BookingFormModal.tsx`** — make pet linking non-silent:
   - When creating a new booking (not editing) and a customer is selected, auto-populate `petIds` with **all** of that customer's pets as soon as `petsQ.data` loads. If the customer has exactly one pet, it's pre-checked; if they have several, all are pre-checked and staff can uncheck any they don't want.
   - Reset `petIds` to `[]` when the customer changes (already happens) so the auto-populate can re-run for the new customer.
   - Block submit with a clear toast if the customer has pets available but the user has unchecked all of them ("Select at least one pet for this booking"). If the customer genuinely has zero pets, submission is still allowed (with the existing "This customer has no pets yet" notice).
   - Same rules apply when the modal is opened from the **Convert Booking Request** flow — the prefill already passes `pet_ids`, and the same auto-populate logic applies if the request had no `pet_id` but the customer has pets.

2. **Backfill BK00001** — one-time data fix so the current booking shows Charlie:
   - Insert `booking_pets(booking_id = BK00001, pet_id = Charlie, tenant_id = <tenant>)`.

## Out of scope

- No schema changes.
- No changes to the booking-request creation flow, calendar, or detail panel logic beyond what re-renders naturally when `booking_pets` is populated.
- Not touching `NewBookingModal.tsx` (unused mock component — the real form is `BookingFormModal.tsx`).

## Acceptance

- Creating a new booking for a customer with pets auto-checks their pets; submitting without any pet selected (when pets exist) shows an error.
- `BK00001` detail page and side panel show Charlie under Pets.
- Converting a booking request still works and pre-selects the request's pet (or all customer pets if the request had none).
