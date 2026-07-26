# Grooming booking cleanup

Three fixes, one migration + focused UI edits.

## 1. Duration presets → 1 hour standard

In `src/features/bookings/BookingFormModal.tsx`:

- `DURATION_PRESETS.grooming_inhouse` and `grooming_mobile` become:
  `[{ label: "15 min", mins: 15 }, { label: "1 hour", mins: 60 }]` (15 min is for single individual-treatment bookings; the "Custom…" option stays for edge cases).
- `DEFAULT_DURATION.grooming_inhouse` and `grooming_mobile` change from `90` → `60`.
- When an individual-treatment-only booking is detected (no package, only individual add-ons selected), auto-suggest 15 min. User can override.

## 2. Deduplicate the rate card

The `grooming_packages` table has two parallel sets of dog rows (e.g. `dog_full_medium` "Dog Full Package — Medium" **and** `dog_medium_full` "Medium dog — Full groom") at the same price. Same for Express. Migration will:

- Deactivate the older `dog_<size>_full` / `dog_<size>_express` rows (keep the "Dog Full Package — <Size>" / "Dog Express Wash & Dry — <Size>" naming — matches the PDF wording best).
- Standardise `expected_minutes` to 60 for all dog Full and Express packages (Charlotte confirms sessions are 1 hr).
- Rename cat/rabbit `standard` duplicates the same way (keep one row per species).

No data loss — deactivated rows stay for historical bookings; dropdowns filter by `active`.

## 3. "No package — individual treatments only" flow

Today the Package dropdown is effectively required for pricing. Change:

- In `BookingFormModal.tsx` grooming section, when Package = "— Select package —" (empty), keep the booking valid and show the Extras & fees list **including** the individual-treatment add-ons (Teeth gel, Teeth + toothpaste, Nail trimming, Ear cleaning, Hand stripping, Anal gland express).
- When a **Full** package is selected, hide the individual treatments that are already bundled (teeth gel, nail trim, ear clean, anal gland) from Extras — they're included. Show only true upsells (teeth + toothpaste upgrade, hand stripping, shampoo upgrades, travel/pickup, Stay & Play).
- When an **Express** package (wash & dry only) is selected, show all individual treatments as available add-ons (nothing bundled).
- Price preview sums correctly in all three modes (no package / express / full).

Bundled-in-full list is hard-coded by add-on `code`: `teeth_gel`, `nails_trim`, `ear_clean`, `anal_gland`. Everything else stays purchasable.

## 4. Portal parity

Apply the same "no package" option and 1-hour default to `GroomingRequestWizard.tsx` (customer portal), so customers can request just a nail trim.

## Technical notes

- Files touched: `BookingFormModal.tsx`, `GroomingExtrasPanel.tsx` (bundled-in-full filter), `GroomingRequestWizard.tsx`, one SQL migration for `grooming_packages` cleanup + duration normalisation.
- No schema changes — only data updates and UI logic.
- Instructions panel (styling picks) is untouched; this only affects the priced Extras panel and Package dropdown.

## Out of scope

- Rebuilding the grooming instructions catalog.
- Changing the mobile-van scheduling rules.
- Any pricing changes beyond the duplicates.
