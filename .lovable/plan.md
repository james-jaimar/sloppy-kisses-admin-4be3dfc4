
## Goal
Make the New Booking modal fast and obvious. Fix the four things you called out on the Grooming (in-house) new-booking screen.

## Changes

### 1. Smart start prefill on the calendar
Today the calendar's "New booking" button opens the modal with no `start_at` unless the URL has `?newBooking=1&start=...`. Fix by:
- Track the "focused slot" in `CalendarWeekView`: when the user clicks an empty cell in day/week view, remember `{ resourceId, startAt }` and open the modal.
- The existing top-right "New booking" button falls back to the current view's anchor date at the next round hour (or 09:00 if viewing week/month) so there is always a sensible default.
- Pass `start_at` (and `resource_id` when clicked from a resource lane) into `BookingFormModal` via the existing `prefill` prop.

### 2. Replace "End" with "Duration"
In `BookingFormModal`:
- Drop the raw `End` datetime-local input.
- Keep `Start` as a single datetime-local (browser-native picker — we don't need the custom double-column popover shown in the screenshot; that's the OS control on this browser, but the form itself will just be one field labelled Start, so it reads simpler).
- Add a `Duration` control: a small select of common presets per service (`30 / 45 / 60 / 90 / 120 min` for grooming/transport, `full day` for daycare, `nights` counter for hotel) plus a "Custom…" option that reveals a minutes input.
- Compute `end_at = start_at + duration` on submit. Defaults: grooming 90 min, transport 30 min, daycare uses tenant daycare hours (08:00–17:00), hotel uses one night (check-in 08:00 → next-day check-out 17:00) — matching what we already do elsewhere.
- Edit mode: seed duration from `booking.end_at - booking.start_at`.

### 3. Remove duplicate grooming fields
`GroomingFields` currently duplicates things that `GroomingExtrasPanel` already owns properly (package, pensioner discount, travel fee, surcharge). For grooming bookings:
- Remove the free-text `Service package`, `Duration (min)`, `Pensioner discount`, `Travel fee`, `Surcharge`, and `Recurring booking` inputs from `GroomingFields`.
- Keep only: `Groomer` (free text override for who's doing it — separate from Resource, which is the station/van) and `Grooming notes`.
- Package + add-ons + discounts + travel/matted/sedation stay in `GroomingExtrasPanel` (the panel already computes total).
- On submit, still write `grooming_details` but source `service_package` from the selected rate-card package name, `pensioner_discount` from the extras panel checkbox, and `duration_minutes` from the new duration field. No user-visible duplication.

### 4. Resource label tidy
The "Resource" dropdown currently reads `— Unassigned —` then lists resources of the matching type (e.g. `In-house grooming`). Change the label to say what it's for so it doesn't read as a duplicate of the service type:
- Rename the field to `Groomer / station` for grooming, `Van` for mobile grooming, `Kennel / suite` for hotel, `Vehicle` for transport, `Area` for daycare (driven off `serviceType`).
- Keep "— Unassigned —" as the default.
- No behavioural change; purely a label swap so the double-entry perception goes away.

## Files touched
- `src/features/calendar/CalendarWeekView.tsx` — slot-click state + prefill (`start_at`, `resource_id`).
- `src/features/bookings/BookingFormModal.tsx` — duration field, resource label, remove end input, submit math, prefill support.
- `src/features/bookings/BookingDetailsFields.tsx` — slim down `GroomingFields`.

## Out of scope
Hotel nights UX, calendar drag-to-create, and any changes to the extras/instructions panels — this pass is only the "top of the form" cleanup you called out.
