# Gate the 50% hotel checkout groom discount

## What's happening

The discount is not tied to the hotel booking at all. `grooming_checkout_discount_pct(booking)` simply looks for *any* non-cancelled hotel booking for the same customer whose checkout date equals the groom's date, and if it finds one it returns the tenant's `checkout_groom_discount_pct` (50%). The grooming auto-invoice trigger then stamps that 50% onto the package line — which is what produced "hotel checkout groom −50%" on INV00253 for a standalone groom.

There is already a proper link between a hotel stay and its groom: `hotel_grooming_requests` (hotel booking, pet, and `grooming_booking_id` once scheduled), plus the `schedule_hotel_groom` / `create_checkout_groom` routines that create the groom from the stay. The date-match rule ignores that link.

## The fix

Make the discount depend on provenance, not on a date coincidence:

1. `grooming_checkout_discount_pct` returns the discount only when the grooming booking is linked to a hotel stay — i.e. a `hotel_grooming_requests` row points at it (or the groom was created by the hotel scheduling path) — **and** the groom falls inside that stay's window, with the checkout day carrying the discount as today.
2. Any groom booked independently (staff New booking, portal grooming wizard, walk-in) gets 0% checkout discount, even if the customer happens to have a stay ending that day. The pensioner discount logic is untouched.
3. Keep the existing behaviour for hotel-scheduled grooms: the discount and the "hotel checkout groom −X%" line label still appear automatically.

## Manual override

Staff can still grant the discount deliberately: the grooming booking keeps its `hotel_checkout_discount_pct` field, and an explicitly set value is respected rather than recomputed — so a front-desk override on a genuine hotel guest still works, and the invoice line can also be edited directly as today.

## Cleaning up what's already wrong

- Find open (unlocked) grooming invoices where a checkout discount was applied but the groom has no hotel link, and reverse the discount on those lines.
- INV00253 in the screenshot is one of them: the R545 package line drops back to full price and the invoice total is recalculated. Locked/paid invoices are left alone and listed for you to handle manually with a credit note.

## Technical notes

- One migration: rewrite `public.grooming_checkout_discount_pct(uuid)` to join through `hotel_grooming_requests` (and the stay's date range) instead of matching customer + checkout date; adjust `grooming_details_auto_invoice` to not overwrite a manually set `hotel_checkout_discount_pct`.
- A data cleanup statement for existing mis-discounted, unlocked invoice lines, followed by the usual invoice recompute.
- No UI change needed in the booking form; `ScheduleHotelGroomDialog` continues to show the checkout-day discount hint because those grooms remain eligible.
