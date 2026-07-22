# Sprint 4 — Mobile vans + Pickup/Drop-off to parity

Bring mobile grooming vans and pickup/drop-off transport up to the same end-to-end path daycare and hotel already have: request → booking with resource → status flow → auto-invoice line on the correct month's draft → visible on Customer 360 + portal → comms fired.

## What already exists (verified)
- `MobileVansPage` with day picker, van tabs, `VanTimeline`, `RouteSummary`, `UnassignedStrip`, and `van_workflow_settings` (min/max travel gap).
- `TransportBoardPage` with vehicle tabs, columns view, `UnassignedTransportStrip`, and `transport_workflow_settings`.
- Resources of type `mobile_van` and `transport_vehicle` (with `home_suburb`) via `ResourcesPage`.
- Portal `GroomingRequestWizard` (in-house + mobile) and `TransportRequestWizard` writing to `booking_requests`.
- Grooming auto-invoice trigger (Sprint 3) already produces lines for both `grooming_inhouse` and `grooming_mobile` service types.

## Parity gaps to close

### 1. Transport auto-invoice trigger + settings
- New `transport_details_auto_invoice` trigger on `transport_details` insert/update, mirroring the grooming/hotel triggers.
- Rate source: new columns on `transport_workflow_settings` — `default_fee_zar`, `per_km_zar`, `round_trip_multiplier`, plus optional `suburb_fees` jsonb (`{ "Bryanston": 120, ... }`).
- Line description: `"Transport — {pet} · {direction} · {suburb}"`, appended to the current-period draft (respects billing cycle).
- Trigger recalculates when direction/suburb changes.
- Settings-first: extend `TransportWorkflowPage` with the new fields, gated by `settings.transport.manage`.

### 2. Van route / time enforcement
- Server-side check `van_can_assign_stop(booking_id, resource_id)` RPC:
  - Enforces `min_travel_gap_minutes` between this stop and its neighbours on the same van/day.
  - Warns (never blocks) when gap > `max_travel_gap_minutes`.
  - Blocks overlap with any confirmed stop on the same van.
- `useAssignBookingToVan` calls the RPC before the update; surfaces block reason as a toast.
- Same pattern for transport: `transport_can_assign_leg(booking_id, resource_id)` respecting vehicle capacity (new `capacity` already on `resources`).

### 3. Suburb-aware auto-assign helper (optional per stop)
- "Auto-assign" button on `UnassignedStrip` (mobile) and `UnassignedTransportStrip`:
  - Picks the van/vehicle whose `home_suburb` matches the customer suburb; falls back to the van with the smallest resulting max-gap.
  - Client-side heuristic, no schema change.

### 4. Convert-request wiring for mobile + transport
- Extend `BookingRequestQueue` "Convert" action so `grooming_mobile` and `pickup_dropoff` requests open `BookingFormModal` prefilled from `request_payload` (pet, times, direction, addresses).
- On save: mark request `converted`, set `booking_id`, fire `booking_created` notification event.
- (Full cross-service dispatcher lands in Sprint 5; this sprint just handles these two service types.)

### 5. Status flow + comms hooks
- Add the same `booking_status_events` transitions the hotel/grooming boards use — `en_route`, `arrived`, `completed` — surfaced as buttons on van/transport cards.
- Ensure each transition writes a `notification_events` row (`transport_en_route`, `transport_arrived`, `grooming_mobile_en_route`, `grooming_mobile_arrived`) using existing dispatcher; template bodies come in Sprint 7.

### 6. Customer 360 + portal visibility
- Confirm `BookingsTab` and `HistoryTab` render mobile grooming and transport bookings with their resource and suburb (data is already fetched — verify labels are correct, add resource name column if missing).
- Portal `MyBookingDetailPage`: show assigned van/vehicle name and ETA window when set.

## Out of scope
- Live GPS / driver mobile app (later).
- Multi-stop routing optimisation beyond suburb heuristic.
- Full cross-service convert dispatcher (Sprint 5).
- Comms template bodies (Sprint 7).

## Technical notes
- All new SQL (trigger, RPCs, settings columns) in one migration following the four-step template; grant `EXECUTE` to `authenticated`.
- New queries live in existing `mobileVans/queries.ts` and `transport/queries.ts`.
- Settings-first: nothing hardcoded; every fee, gap, and suburb rule editable in Admin → Settings.
- No hardcoded colors — reuse coral / semantic tokens.

Say **"go"** to start, or tell me which deliverable to drop / re-order.
