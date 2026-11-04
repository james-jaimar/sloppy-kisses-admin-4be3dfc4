# Front-office workflow improvements — options A and B

## Goal
Make phone bookings, repeat grooming and morning drop-offs easier for Charlotte and her staff, without losing control over money, pet care or who performed the work.

Both options are covered in four slices. Complete and verify each slice before moving on; reuse existing controls rather than rebuilding them.

## Slice 1 — Predictable grooming billing (Option A)
- Check when a future grooming invoice is actually created, issued, emailed and made payable. An invoice dated in the future is not the same as holding it until that date.
- Add an admin-controlled grooming invoice release policy: at booking, on the appointment day, or a configurable number of days beforehand. Proposed starting policy: appointment day; show the chosen release date in the booking review.
- Keep the initial booking confirmation separate from the later invoice email, preserving per-visit grouping and the staff email opt-out.
- Make same-day bookings work immediately. Rescheduling updates any unreleased billing; cancellation prevents later release.
- Ensure unpaid-booking expiry cannot cancel a future appointment before its payment requirement becomes applicable.
- Do not rewrite existing issued invoices or bulk-change existing bookings silently. Financial corrections continue through credit notes.

**Completion checks:** repeated visits release once per visit at the configured time; retries cannot duplicate invoices or emails; rescheduling and cancellation update the pending release; service dates, due dates, payment holds and Xero eligibility agree. Booking creation, public/portal requests and staff-created bookings follow the same policy.

## Slice 2 — Correct customer details without leaving a booking (Option A)
- Keep the existing add-customer, add-pet and add-address tools; verify their save-and-return behavior first.
- Add focused editing for an existing pet's name/basic details and the selected customer's saved address from within the booking.
- Saving returns staff to the same booking, with customer, pets, dates, packages, extras, instructions and repeats intact. A saved address is selected immediately.
- Make clear that these edits change the reusable customer/pet record, not just this appointment.
- Retain Maps validation, customer ownership checks and existing create/update permissions. Failed or cancelled edits leave the booking intact.

**Completion checks:** correct a pet and address during a multi-pet repeat booking, save/reopen both records, and complete the booking without re-entry. Verify no cross-customer selection or unauthorised edits; saved corrections appear in the customer's existing portal records.

## Slice 3 — Named groomer preference, without losing station capacity (Option B)
- Add an optional preferred groomer per pet/appointment; retain “No preference”. A preference is a request, not a guarantee.
- Keep Station 1–4 as first-come capacity slots; do not rename stations as employees or reserve them permanently for particular people.
- Manage eligible active groomers and preference availability in permission-gated Grooming Settings, reusing the existing staff/PIN roster where suitable.
- Show the preference on booking reviews, appointment panels, parlour briefs, kiosk and daily board. Allow staff to update it without changing the appointment time.
- Preserve the verified PIN start/finish record as the authority for who actually groomed the pet, even when that person differs from the preference.

**Completion checks:** two pets can request different groomers; repeats retain the intended preference; inactive groomers cannot be newly selected; a different verified groomer can perform the work without corrupting attribution or station capacity. Any future customer-facing selector must use the same eligible roster and validation.

## Slice 4 — Faster unscheduled daycare arrival (Option B)
- Improve the existing “Add Unscheduled / Walk-in” flow rather than add a competing check-in system.
- Search by customer, SK number or pet, then offer a clear check-in action on the matching pet. Keep notes optional and show success immediately on the board.
- Distinguish an existing expected attendance, an unscheduled arrival, a trial/assessment and a linked hotel/grooming Stay & Play visit before choosing the applicable existing workflow.
- If attendance already exists, use its valid check-in transition rather than create a duplicate. Two staff clicking together must still produce one arrival.
- Retain health/assessment checks, closures, capacity rules and authorised overrides. Show any applicable charge or covered visit clearly; use configured billing rather than invent a walk-in rate.
- Retain same-day grooming and hotel-origin visibility on the board and printed register.
- Any additional walk-in policy belongs in permission-gated Daycare Settings; existing settings remain authoritative.

**Completion checks:** expected and unscheduled dogs, trial/assessment routing, Stay & Play coverage, repeat taps/concurrent staff, blocked arrivals and applicable charges; attendance reads back on the board, attendance tab and weekly print with no duplicate billing.

## Delivery and verification
1. Implement Slice 1, test it and report the result before starting Slice 2; repeat for Slices 2–4.
2. Add focused rule tests and permission/transaction checks where changes affect billing, dates, access or attendance.
3. Check desktop/tablet/phone presentation for the changed staff screens and preserve existing booking review/progress behavior.
4. Verify the central save-and-reopen flow signed in where possible. Previous authenticated checks were unavailable on the external Supabase connection; reassess access at implementation time and explicitly report any remaining limitation.
5. Treat delivered email and Charlotte's physical printer as separate checks, not as proven by automated tests.

## Technical approach
- Inspect live functions, scheduled jobs, notification dispatch and current code before selecting the billing-release mechanism. Reuse existing invoice, notification, credit-note and Xero paths; do not introduce a parallel billing engine.
- Keep reusable address/pet editing in shared forms and preserve unsaved booking state across their dialogs.
- Store groomer preference separately from station allocation and actual PIN-verified work attribution; enforce same-tenant valid staff selection on the server.
- Reuse attendance operations for quick check-in; extend them only where required for atomic duplicate protection and existing policy enforcement.
- All new configuration ships with audited, permission-gated Settings controls. Preserve tenant isolation and customer-own-record access; do not expand staff financial visibility.

## Not included
No general booking redesign, new pricing, fixed named-station scheduling, hotel lifecycle changes, unrelated security fixes or automatic retrospective changes to issued invoices.