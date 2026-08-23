# Fix: portal in-house grooming booking fails

## What's actually wrong (confirmed)

The `grooming_booking_details.grooming_mode` column has a check constraint allowing only `'inhouse'` or `'mobile'`.

Two places write the wrong value `'in_house'`:

1. `supabase/functions/portal-create-booking/index.ts` lines 428 and 630 — this is the exact error the customer portal hit ("violates check constraint grooming_booking_details_grooming_mode_check", logged twice at 14:15 and 14:16).
2. The database function `create_checkout_groom` (hotel checkout-day groom) also inserts `'in_house'`, so that path would fail the same way.

## The fix

- Change both writes in `portal-create-booking` to `'inhouse'`.
- Recreate `create_checkout_groom` with `'inhouse'` instead of `'in_house'` (migration).
- Check existing `grooming_booking_details` rows for any stray value and normalise if any exist (none can exist while the constraint is on, but confirm during the change).

No schema change to the constraint — `'inhouse'` is the value the rest of the app already reads.

## Verification

After the change, place an in-house grooming booking from the portal and confirm it saves and the invoice is issued, then check the edge function logs are clean.
