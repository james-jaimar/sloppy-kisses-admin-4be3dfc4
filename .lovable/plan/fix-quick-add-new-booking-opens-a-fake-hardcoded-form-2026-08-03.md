# Fix: Quick add → New booking opens a fake, hardcoded form

## What's wrong

The "New booking" modal opened from Quick add (`src/features/bookings/NewBookingModal.tsx`) is a leftover static mock-up. Everything in it is hardcoded: the customer field has `defaultValue="Sarah Johnson (SK-1042)"`, the pet dropdown lists "Max — Golden Retriever" / "Bella — Cavoodle", the groomer list is Nomvula/Kagiso/Sipho, and the date defaults to 09/07/2026. It is not connected to the database at all — there is no customer search, and "Save booking" does nothing.

The real booking form is `src/features/bookings/BookingFormModal.tsx`, which already has customer search (`useCustomers` with debounced search), pets loaded per selected customer, resources, grooming packages, add-ons, recurrence, vaccination gates and hotel capacity checks — and actually saves.

## The fix

1. Point Quick add at the real form: in `src/components/quickAdd/QuickAddProvider.tsx`, replace `NewBookingModal` with `BookingFormModal` (props: `tenantId`, `onClose`, `onSaved` → navigate to the new booking).
2. Delete `src/features/bookings/NewBookingModal.tsx` so the mock can't resurface elsewhere.
3. Check for any other entry points still opening the mock and repoint them the same way.

## Notes

`BookingFormModal` accepts a `prefill` (including `service_type`), so Quick add can land straight on grooming instead of the default service if you want that.