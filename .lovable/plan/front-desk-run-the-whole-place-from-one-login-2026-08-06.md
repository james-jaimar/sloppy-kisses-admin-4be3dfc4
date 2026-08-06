# Front desk: run the whole place from one login

## What I checked

The front desk role (`staff_frontdesk`) already carries 56 permissions: create/edit/cancel bookings across all four services, vaccination override, daycare check-in, hotel/grooming/transport board management, customers and pets CRUD, document verification, comms, invoice create/send/mark-paid, take payments, and work-mode access to every department. Finance-only powers (void, refund, credit notes, credit allocation, reports, settings) sit with accounts/admin — staying as is per your answer.

So the permissions are right. The gaps are in the counter experience:

1. **The Home launcher has no top bar at all.** Every other admin page renders the shared header; `/admin/home` does not — so on the very first screen after login there is no Quick add, no notifications bell, no profile/sign-out menu.
2. **The header search box is dead.** It is a plain input with no handler — typing does nothing.
3. **No walk-in path.** The daycare board can flip an existing attendance row between expected/checked-in/checked-out, but there is no way to add a dog that just turned up. The underlying mutation already supports it.
4. **Quick add isn't permission-aware** — it always shows booking, customer, enrolment, invoice regardless of role.
5. **No counter shortcut to take a payment or start a quote** — both exist, but only if you already know which invoice or customer to open.

## What I'll build

### 1. Header on Home
Render the shared header on `/admin/home` so search, Quick add, notifications and the account menu are there from the moment they log in.

### 2. Real global search
Debounced type-ahead in the header covering customers, pets, bookings and invoices. Grouped results with the useful line of context (customer number, owner name, booking date + service, invoice number + status), keyboard up/down + enter, click jumps straight to the record. Results respect what the signed-in user may view.

### 3. Walk-in check-in
"Walk-in" button on the daycare board opens a small dialog: search customer/pet, optional note, confirm. Creates today's attendance row as `walk_in` + checked in, honouring the existing vaccination and capacity warnings.

### 4. Counter shortcuts on Home
An action strip above the tile grid, each button hidden if the role lacks the permission:
- **New booking** — the most common counter task.
- **Walk-in check-in** — same dialog as above.
- **Take a payment** — pick a customer, see their unpaid/part-paid invoices, record cash/card/EFT via the existing payment dialog.
- **New quote** — opens the existing quote drawer.

### 5. Quick add tidy-up
Gate each Quick add item by permission (booking, customer, enrolment, invoice) so staff only see what they can actually do.

### 6. Front-desk walkthrough
After building, I'll drive the app end to end and confirm each counter job completes: new booking for daycare / hotel / grooming / mobile van / transport, walk-in, take a payment, send an invoice, verify a vaccination document, and raise an incident. Anything broken gets fixed in the same pass and reported back.

## Technical notes

- No database or permission changes — the role grants are already correct.
- New: a global search hook (parallel filtered queries, five results per entity), `WalkInDialog` in `src/features/daycare`, `TakePaymentDialog` wrapping the existing `RecordPaymentDialog` with a customer/invoice picker, and a `HomeQuickActions` strip.
- Reuses `useUpsertAttendance`, `NewQuoteDrawer`, `BookingFormModal` and `RecordPaymentDialog` as they stand.