## Next up: Phase 3 — Hotel & Cattery occupancy

Grooming board (Phase 2) is live and wired to real bookings. Following the roadmap in project memory, the next slice is **Hotel & Cattery** — the multi-night boarding view that runs off the same `bookings` + typed details model.

### What we'll build

1. **Occupancy grid at `/admin/hotel-cattery`**
   - Rows = kennels / runs / cattery pens (from `resources`, filtered by hotel/cattery kinds).
   - Columns = days across a rolling window (default 14 days, prev/next/today controls like the calendar).
   - Cells show a booking bar spanning check-in → check-out, coloured by status, with pet name + owner initial.
   - Click a bar → opens the existing Booking Detail page with `from: "/admin/hotel-cattery"` so Back returns here (same pattern we just added for grooming).

2. **Today panel (right side)**
   - **Arrivals today** (bookings with `start_at` in today) with a "Check in" action → status `checked_in`.
   - **Departures today** (`end_at` in today) with a "Check out" action → status `checked_out` + prompts for final invoice items (deferred: link to Phase 6).
   - **Currently in-house** count + capacity utilisation %.

3. **Vaccination gate (soft warning)**
   - On the check-in action, if the pet's vaccination record is missing/expired, show a warning modal with "Proceed anyway" (logged) or "Cancel". Matches the "soft warning with audit trail" decision from earlier.
   - Audit entry written to a new `booking_events` row (kind `vax_override`).

4. **Settings-first (per Core rule)**
   - New Settings screen **Hotel & Cattery rate card** (`/admin/settings/hotel-rates`): per-species, per-size, per-resource-kind nightly price, plus peak-season multiplier. Admin-only CRUD, same shape as grooming rate card.
   - New Settings screen **Hotel workflow** (`/admin/settings/hotel-workflow`): toggle vaccination gate strictness (soft/hard), define check-in/out cutoff times, late check-out fee.

### Files (planned)

- `src/features/hotelCattery/HotelBoardPage.tsx` — page shell + date window controls
- `src/features/hotelCattery/OccupancyGrid.tsx` — resource-rows × day-columns grid
- `src/features/hotelCattery/OccupancyBar.tsx` — booking bar component
- `src/features/hotelCattery/TodayPanel.tsx` — arrivals / departures / in-house
- `src/features/hotelCattery/queries.ts` — hotel bookings query (uses `start_at`/`end_at` range, local-time boundaries — same fix pattern as grooming)
- `src/features/hotelCattery/vaccinationGate.tsx` — warning modal
- `src/features/settings/HotelRatesPage.tsx` + `hotelRateCardQueries.ts`
- `src/features/settings/HotelWorkflowPage.tsx`
- Migration: `hotel_rate_card`, `hotel_workflow_settings`, `booking_events` (if not present), all with GRANTs + RLS + `has_role` policies
- Route wiring in `src/App.tsx`, Settings index links, sidebar already points at `/admin/hotel-cattery`

### Not in this phase

- Actual invoice generation on checkout (that's Phase 6: Invoices/Payments).
- Notification dispatch (Phase 7).
- Mobile van scheduling (Phase 4).

### Verification

- Seed a boarding booking spanning 3 nights → bar renders across 3 day columns on the right kennel row.
- "Today" filter shows it in Arrivals on check-in day, In-house on middle days, Departures on last day.
- Vaccination modal fires when pet has no vax record; audit row appears.
- Non-admin user cannot open the two new Settings pages.

Shall I proceed with this?