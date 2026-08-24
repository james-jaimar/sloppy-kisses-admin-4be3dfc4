# Calendar scoping audit — and the gaps worth closing

## What I checked (verified in code and in the database)

Each board/calendar and its filters:

| Screen | Bookings filter | Resource lanes | Verdict |
|---|---|---|---|
| Hotel & Cattery board | `service_type in (hotel_dog, hotel_cat)` | `resources.type in (hotel_area, cattery_area)` | Correctly scoped |
| In-house grooming board / diary | `service_type = grooming_inhouse` | in-house pool from `grooming_day_availability` | Correctly scoped |
| Mobile vans board | `service_type = grooming_mobile` | `resources.type = mobile_van` | Correctly scoped |
| Transport board (pick up / drop-off) | `service_type = pickup_dropoff` | `resources.type = transport_vehicle` | Correctly scoped |
| Daycare board / attendance | daycare enrolments + attendance for the day | capacity from daycare settings | Correctly scoped |
| Main calendar (`/admin/calendar`) | all services, user-filterable | all active resources | Intentionally cross-service |
| New booking modal | — | resource dropdown filtered by the service's resource type | Correctly scoped |

Database side: `grooming_day_availability` returns separate `inhouse` and `mobile` pools, `grooming_pick_resource` maps mobile jobs to vans only, `hotel_day_availability` counts only hotel/cattery resources and hotel bookings, `daycare_day_availability` uses the daycare daily capacity. No cross-service pooling remains.

So the answer to the question asked: **every service board is already specific to its own area.** The audit did surface four real gaps in the *availability* layer that sit next to this.

## Gaps found

### 1. Portal hotel bookings can overbook
The portal hotel wizard filters rooms by pet size only — it never checks nightly occupancy. Front desk gets the capacity warning in the admin booking modal; customers do not, so a customer can book a pen that is already full.

### 2. Portal cannot read hotel occupancy even if we wired it
`hotel_day_availability` ends with `WHERE user_has_tenant_access(p_tenant_id)`, so a logged-in customer gets zero rows back. Fixing gap 1 requires the same staff-or-linked-customer access check that `grooming_day_availability` already uses, returning only counts (no customer or pet data).

### 3. Portal daycare requests have no capacity gate
`daycare_day_availability` is only called from the admin enrolment drawer. The portal daycare wizard can book a day that is already at the daily capacity.

### 4. Pick up / drop-off has no availability at all
There is no slot or capacity check for `pickup_dropoff` on either the admin form or the portal wizard — any number of collections can be dropped onto the same van at the same time. The van's day only becomes visible after the fact, on the transport board.

## Proposed work

1. **Open hotel occupancy to the portal** — replace the `user_has_tenant_access` gate in `hotel_day_availability` with the staff-or-linked-customer check, keeping the payload to resource id/name/capacity/day/used.
2. **Capacity notice in the portal hotel wizard** — reuse `HotelCapacityNotice` so customers see "Kennel 3 is full on 12–14 Sep", respecting the tenant's warn/block overbooking mode. In block mode the room is unselectable.
3. **Daycare capacity in the portal wizard** — call `daycare_day_availability` for the chosen days and mark full days as unavailable (with the same warn/block behaviour), so a customer can't take a spot past the daily limit.
4. **Transport day load** — add a per-van, per-day job count from a new tenant-scoped RPC and surface it in the admin booking modal and the transport wizard as "Van 1: 6 stops booked", with a configurable max stops per van per day in Transport workflow settings (settings-first, permission-gated), warning or blocking on the tenant's setting.

## Technical notes

- Migration touches `hotel_day_availability` (access check only, same signature and return type) and adds `transport_day_load(p_tenant_id, p_start, p_end)` returning resource id/name/day/stops, security definer with the same staff-or-customer check.
- `transport_workflow_settings` gains `max_stops_per_van_per_day` and `overbooking_mode` with an admin Settings control.
- Frontend: `HotelRequestWizard.tsx` and `DaycareRequestWizard.tsx` gain capacity hooks from the existing `hotelCattery/queries.ts` and `daycare/queries.ts`; transport load renders in `TransportRequestWizard.tsx` and `BookingFormModal.tsx` via a small `VanLoadNotice` beside the existing `ServiceRadiusNotice`.
- No board/lane changes are needed — the service-to-resource scoping is already correct everywhere.
