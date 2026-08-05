# Hotel bookings from the portal land as "Unassigned"

## Why it happens

The portal booking function (`portal-create-booking`) never sets a `resource_id` on the booking. It only checks total capacity across all hotel/cattery areas, then inserts the booking with no area. The board groups by `resource_id`, so every portal-made stay falls into the "Unassigned" row — including your Doggy booking BK00238. Admin-created bookings are fine because the admin form has an area picker.

Right now the only way to assign an area is to open the booking and edit it.

## Fix — two parts

### 1. Auto-assign an area at booking time

In `portal-create-booking`, after the capacity check and before/right after inserting the hotel booking:

- Pick the resource type from the service: `hotel_dog` -> `hotel_area`, `hotel_cat` -> `cattery_area`.
- Load active resources of that type for the tenant, in `sort_order`.
- Use the existing `hotel_day_availability` RPC over the stay's nights to find the first area with enough free spaces every night for the number of pets.
- Set `resource_id` on the booking to that area. If nothing fits (or no areas exist), leave it unassigned as today — staff still see it in the Unassigned row.

This means a single-hotel setup like yours (Dog Hotel / Cattery) always lands in the right area automatically, and cats never land in the dog hotel.

### 2. Let staff assign from the board

Add a small "Assign area" control for unassigned stays on `/admin/hotel-cattery`:

- On the Unassigned row, each pet bar gets a compact assign action (dropdown of areas valid for that booking's service type, with today's used/capacity shown).
- Selecting an area updates `bookings.resource_id` and refreshes the board — no need to open the booking.
- Areas already full for one or more nights are shown but flagged, matching the existing overbooking behaviour in the admin booking form.

### 3. Backfill the existing ones

Run a one-off data update assigning current unassigned hotel/cattery bookings (BK00238 and any siblings) to the matching area where capacity allows.

## Technical notes

- Files: `supabase/functions/portal-create-booking/index.ts`, `src/features/hotelCattery/OccupancyGrid.tsx`, `src/features/hotelCattery/queries.ts` (add an assign mutation).
- No schema change — `bookings.resource_id` already exists and the board already reads it.
- Existing `hotel_day_availability(p_tenant_id, p_start, p_end, p_exclude_booking_id)` is reused for both the auto-pick and the dropdown capacity hints.
