# Mobile grooming travel fee: always charged, never a tick box

## What I found

The travel fee currently exists in three disconnected places:

- `grooming_workflow_settings.default_mobile_travel_fee_zar` = R110 (the intended rate).
- `grooming_booking_details.travel_fee` — the field the invoice trigger actually bills from (`grooming_details_auto_invoice` adds a "Mobile travel fee" line when it is greater than zero). Nothing sets it: neither the staff booking modal nor `portal-create-booking` writes a value, so it stays null.
- An add-on row `travel_mobile` "Mobile grooming travel fee R110" that shows up as an optional checkbox in the Extras list (the one in the screenshot). Ticking it bills the fee as an add-on line; leaving it unticked bills nothing. There is also an older inactive duplicate `mobile_travel`.

So today a mobile groom only gets charged travel if a staff member happens to tick a box, and if someone ticks it after the field is populated it would bill twice.

## The fix — enforce it at the database, present it as a fixed line

Best place is the database, so every route (staff modal, portal wizard, imports, API) is covered.

1. **Trigger on `grooming_booking_details`** (insert and update): when the parent booking's `service_type` is `grooming_mobile` and `travel_fee` is null or zero, set it from `grooming_workflow_settings.default_mobile_travel_fee_zar`. On in-house bookings force it back to zero. Admins can still override to a different amount (e.g. long-distance) — only null/zero is auto-filled, and a change of service type re-evaluates.
2. **Retire the duplicate add-on.** Deactivate the `travel_mobile` and `mobile_travel` add-on rows so travel can never be double-billed as an extra. Pickup and drop-off fees stay as they are — those are genuinely optional.
3. **Backfill** existing mobile grooming bookings that have no travel fee, but only where the invoice is still unlocked (draft/not paid), so history isn't rewritten.

## UI follow-through

- **Staff booking modal / extras panel:** show "Mobile grooming travel fee — R110 (always charged)" as a locked line in the price preview for mobile bookings rather than a checkbox, with an admin-only "Override amount" input for the exceptional case. The Extras checkbox disappears with the add-on deactivation.
- **Customer portal grooming wizard (mobile):** show the travel fee in the price summary before the customer confirms, so the invoice total is not a surprise.
- **Settings:** the amount is already editable at Settings → Grooming workflow → Default mobile travel fee, so no new settings screen is needed; label it as the fee automatically added to every mobile booking.

## Technical notes

- New function `public.grooming_enforce_travel_fee()` plus a BEFORE INSERT OR UPDATE trigger on `grooming_booking_details`; `SECURITY DEFINER`, `search_path = public`. It runs before `grooming_details_auto_invoice`, so the invoice line is created from the enforced value with no extra code.
- Booking service-type changes on `bookings` also need a small trigger (or re-save of the details row) so switching in-house to mobile picks the fee up.
- Frontend touch points: `src/features/bookings/GroomingExtrasPanel.tsx` (locked line + override), `src/features/bookings/BookingFormModal.tsx` (pass the default through), and the portal `GroomingRequestWizard.tsx` price summary.
- Verify afterwards: create a mobile groom from the staff modal and from the portal, and confirm exactly one R110 "Mobile travel fee" line on each invoice.
