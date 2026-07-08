## Phase 5 — Pick Up / Drop Off scheduling

Mobile Vans (Phase 4) is live. Next on the roadmap is **Pick Up / Drop Off** — the transport board for shuttling pets to/from daycare, hotel, and grooming appointments using the `transport_vehicle` resources and the existing `transport_details` typed row.

### What we'll build

1. **Transport board at `/admin/pickup-dropoff`**
   - Day picker (prev / today / next), defaulting to today.
   - Two columns per vehicle tab: **Pickups** (going to the salon/hotel) and **Drop-offs** (going home), ordered by scheduled time.
   - Each card shows: pet + owner, pickup or drop-off address, suburb, linked service (e.g. "→ grooming @ 10:00"), driver notes, status chip.
   - Click a card → Booking Detail page with `from: "/admin/pickup-dropoff"` so Back returns here.

2. **Route summary panel (right side)**
   - Total legs, unique suburbs, first/last leg time.
   - Gap warnings between consecutive legs on the same vehicle (reuses the same min/max thresholds pattern as vans — see settings below).
   - Quick actions per leg: mark `in_progress` (en route), `completed` (delivered), or `no_show`.

3. **Unassigned transport strip**
   - Bottom strip of pickup/drop-off bookings on the selected day with no `resource_id`; assign-to-vehicle dropdown (same pattern as the vans page).

4. **Booking-detail linkage**
   - Any booking (hotel, grooming, daycare) with `requires_transport = true` that has no linked pickup/drop-off leg for its date shows a small "Add transport leg" warning on the Booking Detail page.
   - Clicking it opens the existing New Booking modal pre-filled as `pickup_dropoff` for the same customer/pets/date.
   - (No auto-generation yet — owner wants to see and confirm each leg.)

5. **Settings-first (per Core rule)**
   - New Settings screen **Transport workflow** (`/admin/settings/transport-workflow`), admin-gated by new permission `settings.transport.manage`:
     - Min / max gap warnings (minutes) between legs on the same vehicle
     - Day start / end cutoff
     - Default lead time (minutes) before service start for pickups, and after service end for drop-offs — used only to seed the "Add transport leg" prefill
   - Per-vehicle home suburb reuses the `resources.home_suburb` column added in Phase 4.

### Out of scope (deferred)

- Auto-creating transport legs from `requires_transport` (Phase 5b once the manual flow is validated).
- Distance / routing / mapping (later phase).
- Driver mobile view + proof-of-drop-off photo (Phase 7+).
- Transport fees on invoices (Phase 6: Invoices).

### Files (planned)

- `src/features/transport/TransportBoardPage.tsx` — page shell, vehicle tabs, day controls
- `src/features/transport/TransportColumns.tsx` — pickup / drop-off columns
- `src/features/transport/TransportCard.tsx` — leg card
- `src/features/transport/TransportSummary.tsx` — totals + gap warnings + quick status actions
- `src/features/transport/UnassignedTransportStrip.tsx`
- `src/features/transport/queries.ts` — vehicles, day legs, unassigned, assign/status mutations, workflow settings hooks
- `src/features/settings/TransportWorkflowPage.tsx`
- Minor edit to `src/features/bookings/BookingDetailPage.tsx` — surface "Add transport leg" hint when `requires_transport && no linked leg on that date`
- Migration: `transport_workflow_settings` table + `settings.transport.manage` permission (grant to any role that already has `settings.vans.manage`), with GRANTs + RLS
- Route wiring in `src/App.tsx`, Settings index link; sidebar already points at `/admin/pickup-dropoff`

### Verification

- Seed a pickup_dropoff booking on a vehicle for today → appears in the correct Pickup or Drop-off column at the right time.
- Assign a vehicle to an unassigned leg → it moves out of the strip and into the board on refetch.
- Two legs 5 min apart trigger "gap too small"; 3 h apart trigger "gap too large".
- A hotel booking with `requires_transport = true` and no linked leg shows the "Add transport leg" hint on its detail page; without the flag it doesn't.
- Non-admin user cannot open `/admin/settings/transport-workflow`.

Shall I proceed with Phase 5 as above?
