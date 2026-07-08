## Phase 6 — Daycare Enrolments & Attendance

Phases 1–5 are live (bookings, grooming board, hotel occupancy, mobile vans, pickup/drop-off). Per the roadmap, the next phase is **Daycare** — turning the existing `daycare_plans`, `daycare_enrolments`, `daycare_day_swaps`, and `daycare_attendance` tables into a working operator workflow.

### What we'll build

1. **Daycare board at `/admin/daycare`**
   - Day picker (prev / today / next) defaulting to today.
   - Two lanes: **Expected today** (from active enrolments matching the weekday, plus one-off day-swap ins) and **Checked in** (attendance rows with `checked_in_at` set, no `checked_out_at`).
   - Each pet card: pet + owner, plan name, arrival window, vaccination status chip, notes flag. Buttons: **Check in**, **Check out**, **No-show**.
   - Capacity meter at the top: today's expected vs. plan capacity ceiling (from `daycare_plans.capacity` — read-only display for now).

2. **Enrolments screen at `/admin/daycare/enrolments`**
   - List of active + paused enrolments with pet, owner, plan, weekdays, start/end.
   - Create / edit enrolment drawer: pick pet, plan, weekdays (M–Su chips), start date, optional end date, status (active/paused/cancelled).
   - Row-level "Swap a day" action → creates a `daycare_day_swaps` row (drop one weekday, add another date), so the board picks it up automatically.

3. **Attendance history at `/admin/daycare/attendance`**
   - Filter by date range + pet. Shows arrival / departure times, who checked them in/out, and any incident notes.
   - Read-only for now (edits happen from the board).

4. **Booking-detail linkage**
   - Existing `daycare` service bookings continue to work as one-off day passes and appear on the board alongside enrolled pets.
   - No changes to the booking form; enrolments are their own object.

5. **Settings-first (per Core rule)**
   - **Daycare plans** settings page (`/admin/settings/daycare-plans`), admin-gated by new permission `settings.daycare.manage`: CRUD over `daycare_plans` (name, days per week, price, capacity, active flag). Reuses the existing table.
   - **Daycare workflow** settings page (`/admin/settings/daycare-workflow`), same permission: arrival window (start/end), late-arrival cutoff, auto-checkout time, and whether unvaccinated pets are blocked from check-in.

### Out of scope (deferred)

- Auto-billing enrolments monthly (Phase 7: Invoices/Payments).
- Parent-facing portal check-in confirmations (Phase 8+).
- Behaviour / incident report structured fields (later).
- Photos and daily report cards (later).
- Vaccination gate enforcement beyond a visible chip + optional block toggle — full vax gate lives in Phase 7 comms.

### Files (planned)

- `src/features/daycare/DaycareBoardPage.tsx` — day controls, capacity meter, lanes
- `src/features/daycare/ExpectedLane.tsx`, `CheckedInLane.tsx`, `DaycarePetCard.tsx`
- `src/features/daycare/EnrolmentsPage.tsx`, `EnrolmentDrawer.tsx`, `DaySwapDialog.tsx`
- `src/features/daycare/AttendancePage.tsx`
- `src/features/daycare/queries.ts` — expected-today resolver (enrolments ∪ swaps ∪ one-off bookings minus cancelled swaps), attendance mutations, plans + workflow settings hooks
- `src/features/settings/DaycarePlansPage.tsx`
- `src/features/settings/DaycareWorkflowPage.tsx`
- Migration: `daycare_workflow_settings` table + `settings.daycare.manage` permission (grant to any role that already has `settings.vans.manage` / `settings.transport.manage`), with GRANTs + RLS. No changes to `daycare_plans` / `daycare_enrolments` / `daycare_day_swaps` / `daycare_attendance` schemas — they already exist.
- Route wiring in `src/App.tsx` and Settings index links; sidebar already points at `/admin/daycare`.

### Verification

- Create a plan "3 days/week", enrol a pet on Mon/Wed/Fri → the pet appears in Expected on those weekdays only.
- Add a day swap (drop Wed, add Thu) → pet appears Thu, not Wed.
- Check-in / check-out buttons write to `daycare_attendance` and move the card between lanes.
- Capacity meter reflects count of expected vs. plan capacity.
- Non-admin cannot open the two new Settings pages.

Shall I proceed with Phase 6 as above?