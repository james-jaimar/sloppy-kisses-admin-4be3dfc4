## Problem

Creating a grooming booking from admin fails with:
`new row for relation "grooming_booking_details" violates check constraint "grooming_booking_details_grooming_mode_check"`

## Root cause (verified)

The DB check constraint on `grooming_booking_details.grooming_mode` only allows `'inhouse'` or `'mobile'`.

Frontend writes `'in_house'`:
- `src/features/bookings/BookingFormModal.tsx:346` — `grooming_mode: serviceType === "grooming_mobile" ? "mobile" : "in_house"`
- `src/features/bookings/detailsQueries.ts:10` — TS type declares `"in_house" | "mobile" | null`

Any in-house grooming booking write is rejected.

## Fix

1. `BookingFormModal.tsx` — write `"inhouse"` instead of `"in_house"`.
2. `detailsQueries.ts` — update the TS type to `"inhouse" | "mobile" | null`.
3. Grep the repo for any other `"in_house"` string tied to `grooming_mode` (readers, badges, filters) and align them to `"inhouse"`. Fix any stragglers so display/logic still works.

No DB migration needed — the constraint value is correct; the client was wrong.

## Verification

- Retry the failing new-booking flow (in-house grooming) for the test customer.
- Confirm the row inserts and the booking appears on the calendar.
