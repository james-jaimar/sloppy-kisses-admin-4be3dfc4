## Phase 4 — Mobile Vans scheduling

Hotel & Cattery (Phase 3) is live. Per the roadmap, the next slice is **Mobile Vans** — day-by-day route planning for the grooming vans, running off the same `bookings` + `resources` model we've been using.

### What we'll build

1. **Van day view at `/admin/mobile-vans`**
   - Tabs / selector across the top for each active van (resource type `mobile_van`).
   - Day picker (prev / today / next), defaulting to today.
   - Timeline of stops for that van on that day, ordered by `start_at`, showing: time, pet + owner, suburb, package, expected minutes, status chip.
   - Click a stop → Booking Detail page with `from: "/admin/mobile-vans"` so Back returns to the van view (same pattern as grooming/hotel).

2. **Route summary panel (right side)**
   - Total stops, total grooming minutes, first / last stop time, unique suburbs.
   - "Travel gaps" list: any gap < 15 min or > 90 min between consecutive stops flagged as a soft warning (configurable in settings).
   - Quick actions per stop: mark `in_progress`, `completed`, or `no_show` (status transitions consistent with grooming board).

3. **Unassigned mobile bookings strip**
   - A horizontal strip at the bottom showing mobile-grooming bookings on the selected day with no `resource_id` yet.
   - Assign-to-van via a small dropdown on each card (writes `resource_id`); no drag-drop yet.

4. **Settings-first (per Core rule)**
   - New Settings screen **Mobile Van workflow** (`/admin/settings/van-workflow`), admin-gated by new permission `settings.vans.manage`:
     - Min travel gap (minutes) — default 15
     - Max travel gap (minutes) — default 90
     - Day start / day end cutoff (used to flag stops outside working hours)
     - Per-van optional home suburb (free text, used later for routing)
   - Van resources themselves are already managed under existing Resources settings — no duplication.

### Out of scope (deferred)

- Actual map / geocoding / route optimisation (Phase 4b or later).
- Travel-fee auto-calc on invoices (Phase 6: Invoices).
- Driver mobile view / GPS check-in (Phase 7+).
- Drag-drop re-ordering (follow-up once the read view is solid).

### Files (planned)

- `src/features/mobileVans/MobileVansPage.tsx` — page shell + van tabs + day controls
- `src/features/mobileVans/VanTimeline.tsx` — ordered stop list
- `src/features/mobileVans/RouteSummary.tsx` — totals + gap warnings + status actions
- `src/features/mobileVans/UnassignedStrip.tsx` — assign-to-van cards
- `src/features/mobileVans/queries.ts` — vans, day bookings, unassigned mobile bookings, assign mutation (local-time day boundaries, same pattern as grooming/hotel fixes)
- `src/features/settings/VanWorkflowPage.tsx` + `vanWorkflowQueries.ts`
- Migration: `van_workflow_settings` table + `settings.vans.manage` permission (grant to any role that already has `settings.hotel.manage`), with GRANTs + RLS
- Route wiring in `src/App.tsx`, Settings index link; sidebar already points at `/admin/mobile-vans`

### Verification

- Seed a mobile-grooming booking on a van for today → appears in that van's timeline in the correct time slot.
- Change the day → list updates; empty state renders when no stops.
- A booking with no `resource_id` appears in the Unassigned strip; assigning it moves it into the timeline on refetch.
- Two stops 5 min apart trigger the "gap too small" warning; 2 h apart trigger "gap too large".
- Non-admin user cannot open `/admin/settings/van-workflow`.

Shall I proceed with Phase 4 as above?
