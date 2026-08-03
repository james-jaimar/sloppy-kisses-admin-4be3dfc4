# Hotel & Cattery board: one line per pet + real occupancy limits

## What's wrong (verified)

- `OccupancyGrid.tsx` draws every booking bar for a resource at the same vertical offset (`top-1.5`, fixed height), so overlapping stays sit on top of each other in a single row.
- Bars are labelled with only the first pet (`b.pets[0]`), so multi-pet bookings hide pets entirely.
- Both hotel resources (`Dog Hotel`, `Cattery`) have `capacity = NULL` in the database, so there is no maximum to check against. The side panel's "0 / 2" is counting resources, not pens.

## What we'll build

### 1. One line per pet
Explode each booking into one bar per pet, then lay bars out in stacked lanes inside the resource row so nothing overlaps:
- A booking with 3 pets renders 3 bars (pet name, owner, booking number).
- Bars that overlap in time each get their own lane; the resource row grows in height to fit the lanes.
- Left column keeps resource name, capacity and today's used/free count.

### 2. Occupancy numbers
- Per resource, per day: a count strip showing `used / capacity` for every day in the window, colour-coded (normal / near full / full / over-capacity in red).
- Header shows total pens and window-wide peak occupancy.
- Right-hand panel's capacity tile becomes a real in-house pets vs total pen capacity figure, plus a short "full days in this window" warning list.

### 3. Capacity as a setting
- Capacity is already editable on Settings → Resources; relabel it "Pens / spaces" for hotel and cattery resources with helper text.
- Occupancy counts pets, not bookings, so one booking with two dogs uses two spaces.

### 4. Booking guardrails
- New tenant-scoped DB function `hotel_day_availability(tenant_id, start_date, end_date)` returning per-resource, per-day used vs capacity.
- Admin hotel booking form and the portal hotel wizard call it when dates or resource change and show remaining spaces per night; full nights are flagged.
- New `overbooking_mode` setting in Settings → Hotel workflow: **Warn** (allow with a confirm, default) or **Block** (deny). The portal always blocks full nights regardless of the setting.

## Technical notes

- `src/features/hotelCattery/OccupancyGrid.tsx` — rewrite layout: build `{petId, booking, startMs, endMs}` segments, greedy lane assignment per resource, render lanes at `top: lane * laneHeight`.
- `src/features/hotelCattery/queries.ts` — add a per-day pet-count helper computed client-side from the existing booking fetch (no extra round-trip for the board).
- Migration: `hotel_day_availability` RPC (security definer, tenant-scoped, with EXECUTE grants) plus `overbooking_mode` on `hotel_workflow_settings`.
- `TodayPanel.tsx` — capacity tile fed by real pen capacity.
- Booking paths touched for the guardrail: hotel extras/details panel in the admin booking form and the `portal-create-booking` edge function.

## One input needed

Capacity is blank for both `Dog Hotel` and `Cattery`. Give me the real numbers (e.g. 20 kennels, 8 cattery pens) and I'll set them during the build; otherwise the grid will show "no limit set" until you fill them in Settings → Resources.