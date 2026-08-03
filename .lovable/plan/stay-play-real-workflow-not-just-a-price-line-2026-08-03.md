# Stay & Play: real workflow, not just a price line

## What exists today (verified)

- Grooming has an add-on `stay_play_after` ("After-groom Stay & Play", R250) and a settings field `grooming_workflow_settings.after_grooming_stay_play_zar`.
- Hotel has a surcharge `late_checkout` ("Late Checkout / Stay & Play (16:00–16:30)", R250).
- Both are **billing only**. Ticking them creates no attendance record, no collection time, no card on any board, and no capacity impact. Staff have nowhere to see who is on Stay & Play or when they are being collected.
- Daycare capacity: `daycare_workflow_settings` has arrival windows and auto-checkout but **no daily capacity column** — one has to be added for the "counts against daycare capacity" rule to mean anything.

## What we'll build

### 1. A Stay & Play record
A new `stay_play_sessions` row is created automatically whenever a booking gets the grooming Stay & Play add-on or the hotel late-checkout surcharge (and removed if it is unticked). Each session holds: pet, customer, source booking, date, origin (grooming / hotel), expected collection time, status (awaiting → in care → collected → no-show), actual collection stamp, and notes.

Expected collection time defaults from the booking (groom finish time / hotel checkout time) and is editable by staff.

### 2. Daycare board: a dedicated Stay & Play lane
- A separate lane on the Daycare board (and in the tablet Work-mode daycare view) listing today's Stay & Play pets, badged **After groom** or **After hotel**, with the originating booking number.
- Card shows expected collection time. Past that time the card flips to an overdue state (red, "Overdue 25m") and the pet is counted in an "Overdue collection" strip at the top of the lane.
- Tap actions: **In care**, **Collected** (stamps the time), **Set / change collection time**, and jump to the source booking.

### 3. Capacity
- New daily capacity setting on Settings → Daycare workflow.
- The daycare day count includes Stay & Play pets, so the board header reads e.g. `38 / 40 spaces (3 Stay & Play)`.
- When a booking is being given Stay & Play and the day is at capacity, the booking form shows a capacity warning (same pattern as the hotel capacity notice); staff can still proceed, the portal cannot.

### 4. Front desk visibility
- Home launcher Daycare tile count includes Stay & Play pets; a separate attention badge appears when anyone is overdue for collection.
- Grooming board and Hotel board cards get a small "Stay & Play" chip so the department knows the pet does not go home after the groom / checkout.

### 5. Customer portal
- Grooming wizard: Stay & Play offered as a priced tick (already an add-on) with a "collect by" time selector, blocked when the daycare day is full.
- Hotel wizard: late checkout / Stay & Play offered the same way on the checkout day.
- The customer's booking detail shows Stay & Play and the collection time, and the confirmation notification includes it.

### 6. Settings
Settings → Daycare workflow gains: daily capacity, default Stay & Play collection time, and a grace period before a collection is flagged overdue. Prices stay where they are (grooming workflow + hotel surcharges).

## Technical notes

- Migration: `stay_play_sessions` table (tenant-scoped, GRANTs + RLS mirroring `daycare_attendance`), triggers on `grooming_booking_addons` and `hotel_booking_surcharges` to create/remove the session, plus `daily_capacity`, `stay_play_default_collect_time` and `stay_play_grace_minutes` on `daycare_workflow_settings`.
- New `src/features/daycare/stayPlayQueries.ts` (day list, set collection time, status transitions) and a `StayPlayLane.tsx` used by `DaycareBoardPage.tsx` and `work/DaycareWorkPage.tsx`.
- `countDaycareExpected` in `src/features/daycare/queries.ts` extended to add Stay & Play sessions so home tile, board header and capacity all agree.
- Capacity notice reused from the hotel pattern (`HotelCapacityNotice.tsx`) as a daycare variant used by `BookingFormModal.tsx` and `portal-create-booking`.