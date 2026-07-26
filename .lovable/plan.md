## Hotel & Cattery — Areas, Multi-Pet Pricing, Size Gating, Late Checkout

Digitise Sloppy Kisses' Pet Hotel price list so bookings price themselves correctly for multiple pets, respect the "puppy & small breeds" size restriction, and support the R250 late-checkout / Stay & Play fee.

### 1. Seed the current 2026 price list

Populate `hotel_rate_cards` for tenant Sloppy Kisses with these five rows (nightly, ZAR):

| Species | Accommodation code | Display name | 1st pet | Extra pet |
|---|---|---|---|---|
| dog | puppy_small | Puppy & Small Breeds Area | 445 | 400 |
| dog | hotel | Hotel | 560 | 460 |
| dog | cabana | Cabanas | 460 | 445 |
| cat | cattery | Cattery | 360 | 320 |

Add one entry to `hotel_surcharges`:
- code `late_checkout`, name "Late Checkout / Stay & Play (16:00–16:30)", price R250, per_night = false.

### 2. Add size-band gating to rate cards (strict)

Extend `hotel_rate_cards` with `min_size_band` and `max_size_band` (nullable, using the existing `small | medium | large | xl | xxl` enum used by grooming). Seed:
- Puppy & Small Breeds → min `small`, max `small`
- Hotel / Cabanas → no restriction
- Cattery → cat-only (species already enforces)

Behaviour in the New/Edit Booking flow when service = Hotel:
- Show all rate cards for the pet's species, but grey out any card whose size range excludes the pet's `size_band` and block selection with a tooltip: "This area is reserved for small breeds & puppies."
- If the pet has no `size_band` set, prompt the user to set it on the pet before booking.

### 3. Multi-pet pricing on a single booking

Today one `bookings` row already links to multiple pets via `booking_pets`. Update the hotel pricing calc so per-night cost = `nightly_rate_zar` + `extra_pet_rate_zar × (pet_count − 1)`, multiplied by nights. The peak uplift % stays as-is on top.

Auto-invoice trigger for hotel bookings is updated to write one invoice line per rate card + a single "Additional pets" line rather than a flat nightly figure, so the invoice is readable.

### 4. Late checkout — manual toggle

Add a `late_checkout` boolean to `hotel_booking_details` (default false). In the booking form (admin + customer portal Hotel wizard), show a "Late checkout / Stay & Play (16:00–16:30) — R250" checkbox. When ticked, the invoice trigger inserts the surcharge line automatically; unticking removes it.

### 5. Settings screen polish

`HotelRatesPage` already exists — reorder columns to show `1st pet` and `Extra pet` side-by-side, add the Size band min/max inputs, and add a "Seed 2026 price list" one-click button (visible only when the table is empty) so Charlotte can restore defaults if she deletes something.

### Technical notes

- Migration: `ALTER TABLE hotel_rate_cards ADD COLUMN min_size_band size_band_enum, ADD COLUMN max_size_band size_band_enum;` and `ALTER TABLE hotel_booking_details ADD COLUMN late_checkout boolean NOT NULL DEFAULT false;`. Seed rows via the insert tool (not migration).
- Pricing calc lives in the existing hotel invoice trigger — extend it to read `booking_pets` count and apply the extra-pet formula, and to append the late-checkout surcharge line when the flag is true.
- Portal `HotelRequestWizard.tsx` gains the late-checkout checkbox and the size-filtered room dropdown so customers can't request a mismatched area.
