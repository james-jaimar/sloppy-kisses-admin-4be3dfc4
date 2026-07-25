## Problem

The New/Edit Booking modal shows two overlapping controls for grooming extras:

- **Add-ons panel** — every row from `grooming_addons` (Tick & Flea shampoo, Anal glands, Ear cleaning, Teeth, De-shedding, Hypoallergenic, Travel, Pickup, Stay & Play…).
- **Grooming instructions panel** — the catalog (Shampoo/Conditioner, Teeth, Ears, etc.) where several options are linked to those same add-ons via `grooming_instruction_options.addon_code`.

Ticking "Tick & Flea" in Add-ons does not tick it under Shampoo/Conditioner in Instructions (and vice-versa), so groomers see conflicting info and the price preview can double-charge.

## Goal

One tick, one price, one source of truth — and the groomer view still shows everything they need.

## Approach

Treat **grooming instructions as the source of truth for any add-on that belongs to a catalog group**. The Add-ons panel becomes a slim "extras & fees" list that only shows add-ons the catalog doesn't cover.

### 1. Split add-ons into "catalog-linked" vs "standalone"

- Compute `linkedAddonCodes = new Set(instructionOptions.filter(o => o.addon_code).map(o => o.addon_code))`.
- In `GroomingExtrasPanel`, filter the add-on checkbox list to **only** addons whose `code` is NOT in `linkedAddonCodes`. What remains: travel, pickup/drop-off, Stay & Play, matted/sedation surcharges, toothbrush purchase, and anything else that is a fee rather than a styling choice.
- Price preview keeps summing both sources (already does).

### 2. Instruction ticks drive add-on selection (already partly wired)

- `BookingFormModal` already has a `useEffect` that adds priced add-ons when instruction options are ticked. Extend it to also **remove** add-ons whose linked instruction option was un-ticked, so the two panels stay perfectly in sync.
- Result: ticking "Tick & Flea" under Shampoo/Conditioner adds the R60 to price preview and to the draft invoice — no separate Add-ons checkbox needed.

### 3. Mirror customer-portal add-on picks back into instructions

- In `src/features/bookingRequests/convert.ts`, when a request carries add-on codes that correspond to instruction options, seed those options into `grooming_booking_instructions` on conversion so the groomer's instruction sheet reflects what the customer requested.
- Same mirroring in the customer portal `GroomingRequestWizard` — it already uses `GroomingInstructionsForm`; verify it does not additionally expose linked add-ons as separate pills.

### 4. Groomer read-only summary

- `BookingDetailPanel` already has `InstructionsSummary`. Confirm it lists every priced instruction with its add-on fee inline so groomers see a single unambiguous checklist (no separate "Add-ons" section duplicating the same items).

## Files to touch

- `src/features/bookings/GroomingExtrasPanel.tsx` — filter add-on list by `linkedAddonCodes`; fetch instruction options via existing `useAllInstructionOptions(tenantId)`.
- `src/features/bookings/BookingFormModal.tsx` — extend the instructions→addons sync effect to also remove de-selected linked add-ons.
- `src/features/bookings/BookingDetailPanel.tsx` — ensure `InstructionsSummary` renders linked prices; drop any duplicate add-on list for those items.
- `src/features/bookingRequests/convert.ts` — mirror portal-selected add-on codes into instruction selections on convert.
- `src/features/customerPortal/.../GroomingRequestWizard.tsx` — sanity-check that no linked-addon pills remain outside the instructions form.

## Out of scope

- No schema changes. `grooming_instruction_options.addon_code` already exists and is the join key.
- No changes to standalone fees (travel, pickup, Stay & Play, matted/sedation) — they stay in the Extras panel.
