# Simplify the grooming booking form

## What changes

When staff create a grooming booking (in-house or mobile) in the New booking modal:

- **Remove the "Start" date/time field.** The date is chosen in the slot picker calendar below.
- **Remove the "Duration" dropdown.** Length comes from the grooming package.
- **Add a "Package" picker** at the top of the grooming section, listing active grooming packages (name, price, expected minutes). Picking one sets the appointment length used by the slot picker and stamps the package on the booking.
- **Move the slot picker up** so the flow reads: Service type → Status → Package → Pick a day and time → Groomer/van → Grooming details.
- The slot grid shows a small caption like "60 min slots — Full Groom (Medium)" so staff can see what length is being booked.
- If no package is picked yet, the slot grid is disabled with a short hint: "Pick a package first."
- Saving without a package or a slot shows a clear message instead of failing silently.

Nothing changes for daycare, hotel/cattery or transport — they keep their existing date and duration fields.

## Technical notes

- `src/features/bookings/BookingFormModal.tsx`: gate the Start and Duration blocks on `kind !== "grooming"`; render the package select + `GroomingSlotPicker` in the grooming branch; drive `durationMins` from the selected package's `expected_minutes` (fallback 60) and `startAt` purely from the slot picker's `onChange`.
- Packages come from the existing `useGroomingPackages(tenantId, { activeOnly: true })` hook in `src/features/settings/groomingRateCardQueries.ts`; filter by the selected pet's species and size band where known, with a "show all" fallback.
- Persist `package_id`, `service_package` (name) and `duration_minutes` on the `grooming_booking_details` row so existing auto-invoicing triggers price the line correctly.
- Editing an existing grooming booking pre-selects the package from `package_id` and its current slot.
- No database changes needed.