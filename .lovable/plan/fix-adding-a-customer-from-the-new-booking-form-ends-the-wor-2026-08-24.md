# Fix: adding a customer from the New booking form ends the workflow

## What's happening

In New booking, the "Add a new customer" panel is rendered *inside* the booking form itself (the picker sits inside the booking's `<form>`, and the customer modal is rendered by the picker). Confirmed in the code:

- `BookingFormModal` wraps everything in `<form onSubmit={handleSubmit}>` (line 957).
- `CustomerCombobox` renders `CustomerFormModal` inline in that tree.
- `CustomerFormModal` has its own `<form onSubmit={handleSubmit}>` with a `type="submit"` Save button, so it is a form nested inside the booking form.

A submit event from the inner form bubbles up to the outer booking form's handler, so pressing "Save customer" also triggers the booking form's own submit — which is why the whole thing closes instead of dropping you back into the booking with the new customer selected. The same nesting exists for the "Add a pet" modal (`PetFormModal`, its own form + submit button), so it will misbehave the same way.

## The fix

1. Render every `ModalShell` through a React portal into `document.body`. Nested modals then live outside the booking form's DOM subtree, so their submits can never reach the booking form. This fixes the whole class of problem (customer, pet, and any future nested modal) in one place.
2. Belt and braces: have the customer and pet form submit handlers stop the event propagating, so a nested case can't leak even if a modal is ever rendered without the shell.
3. Verify the intended flow end to end: Quick add → New booking → "Add a new customer" → save → booking modal stays open with the new customer selected → "Add a pet" → save → pet appears ticked → save booking.

No database, pricing or permission changes.

## Technical notes

- `src/components/modals/ModalShell.tsx`: wrap the returned overlay in `createPortal(..., document.body)`. The existing Escape-key stack and z-index behaviour stay as-is; portalling doesn't change stacking order because each shell is `fixed z-[60]` and mounts in DOM order.
- `src/features/customers/CustomerFormModal.tsx` and `src/features/pets/PetFormModal.tsx`: add `e.stopPropagation()` alongside the existing `preventDefault` in their submit handlers.
- No change needed to `CustomerCombobox`'s `onCreated` wiring or `BookingFormModal`'s pet refetch — that logic is already correct.
