## Goal
Enable safe delete/archive across admin areas that currently only support Create/Update, starting with what blocked you on Tracy's enrolment. Every delete respects invoice locking rules and reverses auto-created invoice lines.

## What's missing today (verified)
Only `useDeleteResource` exists in the mutation hooks. No delete for:
- Daycare: enrolments, plans, day swaps, attendance rows
- Bookings (admin) and booking pets
- Customers, Pets
- Grooming: packages, add-ons, per-booking add-ons
- Hotel booking details, Transport details
- Settings items with delete UI but half-wired (spot-check)

## Scope for this round
Deliver full CRUD for the operator-facing entities most likely to need cleanup:

1. **Daycare**
   - `EnrolmentsPage`: add Delete (with confirm). If enrolment has an auto-created draft invoice line, remove that single line; if the draft invoice becomes empty, delete the draft too.
   - `DaycarePlansPage`: add Delete (block when in use by active enrolments → offer Archive instead).
   - `DaySwapDialog`: allow deleting an existing swap.
   - Attendance row: allow clearing a check-in/out on the board card (revert to expected).

2. **Bookings**
   - Booking detail: add Cancel + Delete (delete only for draft/requested; otherwise force Cancel). Deleting removes booking + `*_booking_details` + `booking_pets`; blocks if a non-draft invoice is linked.

3. **Customers & Pets**
   - Customer detail: Archive (soft) + Delete (hard, only when no bookings/invoices/pets). Pet: Archive + Delete (only when no bookings/attendance).

4. **Grooming settings**
   - `GroomingPackagesPage`, `GroomingAddonsPage`: add Delete with in-use guard (archive fallback).

5. **Resources**
   - Convert current "deactivate" to true Delete when unused, Archive otherwise.

6. **Guardrails (DB)**
   - New SECURITY DEFINER RPCs: `delete_daycare_enrolment`, `delete_booking`, `delete_customer`, `delete_pet` — each checks `user_has_permission`, refuses when linked to locked invoices, and cleans up auto-invoice lines/empty drafts atomically.
   - New permission codes: `daycare.enrolments.delete`, `bookings.delete`, `customers.delete`, `pets.delete`, `grooming.catalog.delete`, `resources.delete`. Granted to the Owner/Admin roles by default.

## UX pattern (consistent)
- Row/detail overflow menu → "Delete" opens an AlertDialog with the reason it may be blocked and an "Archive instead" fallback where relevant.
- Toast confirms deletion and, if a draft invoice was affected, links to the updated invoice.

## Out of scope (call out but don't build now)
- Deleting sent invoices / payments (already correctly locked; credit-note flow stays the answer).
- Bulk delete UIs.
- Platform-level tenants/users deletion.

## Technical notes
- Client hooks added to each feature's `queries.ts` (`useDeleteEnrolment`, `useDeletePlan`, `useDeleteBooking`, `useDeleteCustomer`, `useDeletePet`, `useDeleteGroomingPackage`, `useDeleteGroomingAddon`).
- Migrations: one SQL file adding the RPCs, permission rows, and role_permission grants for the default Owner/Admin roles per tenant.
- Types regen after migration; UI wiring lands after.

Confirm and I'll implement in this order: DB migration → daycare enrolment delete (unblocks Tracy) → the rest.