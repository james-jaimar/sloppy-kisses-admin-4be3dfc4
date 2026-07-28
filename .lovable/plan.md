# Grooming pass — portal instructions, calendar picker, size-driven packages, staff override

Focused on grooming only. Four workstreams; they can ship in one sprint.

## 1. Grooming instructions live in the customer portal

Goal: customer captures grooming preferences per dog once, reuses on every booking.

- **New pet-level tab "Grooming preferences"** in `MyPetDetailPage`, reusing `GroomingInstructionsForm` + `pet_grooming_defaults` (already exists on admin side via `PetGroomingDefaultsPanel`). Save writes to `pet_grooming_defaults` for that pet.
- **Portal dashboard prompt**: on `CustomerDashboard`, show a soft banner "Set grooming preferences for {petName}" for any dog with no `pet_grooming_defaults` row. Dismissable per session; disappears once saved. Not blocking.
- **Booking wizard behaviour** (already seeds from defaults in `GroomingRequestWizard`): keep as-is; add a small inline note "Saved from {pet}'s profile — edits here apply to this booking only" and a checkbox "Also update {pet}'s default preferences" that writes back on submit.

## 2. Calendar-aware date & time picker (portal + admin)

Replace the current "date + morning/afternoon/any" dropdown with a real availability picker.

- **New component** `GroomingSlotPicker` used by both `GroomingRequestWizard` (portal) and `BookingFormModal` (admin, grooming service only).
  - Month calendar on the left; day column on the right showing 15-min slots between grooming operating hours (from `grooming_workflow_settings`; fall back 08:00–17:00).
  - Fetch existing grooming bookings for the chosen day + tenant (status not in `cancelled/no_show`) and mark overlapping slots as taken. Filter by resource if one is chosen; otherwise show taken if all groomer resources are busy.
  - Slot duration = package duration (from selected package) or 60 min default. Only slots where the full duration fits are selectable.
  - Portal never exposes staff/resource names; admin sees the resource pill.
- **Data**: reuse `useResourceConflicts` pattern and a new `useDayGroomingBookings(date, tenantId)` query returning `{start_at, end_at, resource_id}` rows.
- Submitted `preferredStartAt` becomes the exact slot; `preferredEndAt` = start + duration.

## 3. Breed & size are mandatory + drive package visibility

- **Pet form (portal + admin)**: breed already required for dogs via `BreedPicker`. Add: if breed's inferred size is missing OR breed is "Mixed / Cross-breed", show a mandatory "Adult size" radio (Small / Medium / Large / XL / XXL) — persisted to `pets.size`. Cannot save without it for dogs.
- **Package selection** in `GroomingRequestWizard` and admin `BookingFormModal`:
  - Filter `grooming_packages` by the pet's effective size (`size_band === pet.size`, plus packages with `size_band === null` = "any size").
  - If no pet chosen yet, show all with a hint "Pick a pet to filter by size".
  - Remove ability to select a mismatched package (do not just warn — hide).

## 4. Staff size override

Charlotte's example: bill a Large as XL for the head-heavy breed.

- **Schema**: add `size_override` (`pet_size` enum, nullable) + `size_override_reason` (text) + `size_override_by` (uuid) + `size_override_at` (timestamptz) to `pets`. Effective size = `size_override ?? size`. All package filtering, pricing, and defaults use effective size.
- **Admin UI**: on `PetDetailPage`, add a small "Override grooming size" control (staff-only, permission-gated) with reason field. Clearing sets override back to null. Every change writes to `audit_log`.
- **Visibility**: 
  - Portal `MyPetDetailPage` shows a badge "Groomed as XL (override by staff)" and the reason.
  - Admin pet cards, booking form pet pill, and grooming board card all show the override badge in place of the base size.
- **Booking form**: when an override is active, the package list uses the overridden size and shows a callout at the top of the grooming section.

## Sequenced tasks

1. Migration: add `size_override*` columns to `pets`; helper SQL to compute effective size in a view (optional).
2. Update `pets` queries to expose `effective_size` alongside `size`.
3. Portal: pet Grooming Preferences tab + dashboard banner + wizard "save back to defaults" checkbox.
4. Shared `GroomingSlotPicker` + `useDayGroomingBookings`; wire into portal wizard and admin `BookingFormModal` (grooming only).
5. Pet form updates (mandatory adult size for mixed / unknown-size breeds) — portal `MyPetFormModal` + admin `PetFormModal`.
6. Package filtering by effective size in both wizards.
7. Admin size-override UI on `PetDetailPage` + badges everywhere the pet is displayed (portal detail, admin detail, booking form, grooming board card).

## Out of scope (flag for later)

- Applying calendar picker to hotel/daycare/transport wizards (same pattern, but you asked for grooming only).
- Groomer-specific slot picking (right now we treat all groomer resources as pooled availability).
- Notifying admin when a customer changes defaults mid-booking cycle.
