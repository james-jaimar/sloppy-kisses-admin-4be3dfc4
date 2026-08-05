# Hotel booking invoices coming out at R0

## What's actually wrong

Confirmed against the live data for BK00238 / INV00242: the invoice has one hotel line, priced R0,00.

The hotel pricing trigger looks up a rate card by `accommodation_type` (`hotel`, `cabana`, `puppy_small`, `cattery`). The portal's hotel wizard asks for **"Room preference (optional)"** and fills that dropdown from the *resources* list (kennel/room names), defaulting to "No preference". So the booking was saved with no accommodation type, no rate card matched, the nightly rate fell back to 0, and the invoice was issued at R0 — silently.

Two defects:
1. The portal collects the wrong thing (a room name, optionally) instead of the priced accommodation type.
2. When no rate card matches, pricing quietly uses R0 instead of refusing.

## The fix

### 1. Portal asks for accommodation type, and prices it

Replace "Room preference (optional)" on step 1 of the hotel wizard with a required **Accommodation** choice, sourced from the active hotel rate cards for the pets' species, filtered by the pets' size bands the same way the admin panel already does. Each option shows its nightly rate.

Underneath it, a live estimate: nightly rate x nights, plus the extra-pet rate for each pet beyond the first, so the customer sees the amount before confirming. Room preference stays available as a genuinely optional note, but it no longer drives price.

The customer cannot advance past step 1 without choosing an accommodation.

### 2. Pricing refuses to invoice at zero

Change the hotel pricing routine so that if no active rate card matches the species + accommodation type, it raises a clear error ("No hotel rate configured for <type>") rather than writing a R0 line. The failure becomes loud at booking time on both the portal and the admin modal, instead of producing a free stay.

The admin booking modal already has a rate-card-driven accommodation selector, so it is unaffected other than gaining the same guard.

### 3. Repair what's already in the system

Find hotel bookings with a missing or unmatched accommodation type and their R0 invoices, and list them for review. For any still open (not paid, not pushed to Xero), staff set the correct accommodation on the booking, which re-prices the invoice through the existing trigger. BK00238 / INV00242 is the known case.

## Technical notes

- `HotelRequestWizard.tsx`: swap the resources-backed `roomPref` select for a rate-card-backed `accommodationType`, reusing `hotelRateCardQueries` and the size-band gating from `HotelExtrasPanel.tsx`; add it to the step-1 readiness check and pass it as `hotel.accommodation_type`.
- Migration: update `hotel_details_auto_invoice()` to `RAISE EXCEPTION` when the rate-card lookup returns nothing, instead of falling back to 0.
- `portal-create-booking` needs no change — it forwards whatever the wizard sends.
- Repair is a query plus manual re-selection per booking; no bulk data rewrite, since prices differ by accommodation choice.