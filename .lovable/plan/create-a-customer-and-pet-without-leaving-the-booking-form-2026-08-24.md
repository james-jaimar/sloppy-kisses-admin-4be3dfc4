# Create a customer (and pet) without leaving the booking form

## What happens today

The New booking modal's customer field (`CustomerCombobox`) only searches existing customers. If the person at the counter is new, staff have to close the modal, go to Customers, add them, then start the booking again. A brand-new customer also has no pets, and the booking form needs at least one pet.

## What I'll do

1. **"Add new customer" inside the picker**
   Add a permanent action row at the bottom of the customer search list — and a "No customers found — add [what you typed]" prompt when the search returns nothing. Clicking it opens the existing customer form (same fields, same email-duplicate guard and Google address lookup) on top of the booking modal. On save, the new customer is selected in the booking form automatically and you carry on where you left off. Whatever was typed in the search box pre-fills the name (or email/mobile if it looks like one).

2. **"Add a pet" when the selected customer has none**
   In the booking form's pet section, if the customer has no pets (or the right pet isn't listed), show an "Add a pet" button that opens the existing pet form for that customer. On save the pet appears in the list and is ticked ready to book.

3. **Permission-aware**
   Both buttons only show when the signed-in user may create customers / pets; everyone with booking access at Sloppy Kisses (front desk included) has these, so in practice they'll always be there.

4. **Available on every screen using the same picker** — new quote, quick sale, POS, take payment, daycare enrolment — since they all share one component.

## Technical notes

- `CustomerCombobox` gains an optional `allowCreate` (default on) plus internal state to render `CustomerFormModal` and call `onChange` with the created customer via `onCreated`, seeding the query cache so the selected row shows immediately.
- `CustomerFormModal` takes a small `prefill` (name/email/mobile) so the typed search term isn't lost.
- `BookingFormModal` pet block renders `PetFormModal` with `customerId`, then invalidates `useCustomerPets` and pre-selects the new pet id.
- Nested modal z-index/scroll handled through `ModalShell` as used elsewhere.
- No database, RLS or pricing changes.
