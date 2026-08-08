# Mobile vans: addresses, maps and route optimisation

Goal: every mobile job has a real, mappable address; the system picks the nearest van with a free slot; the office sees the day's route in a sensible order on a map; and groomers' phones confirm where they were when they started and finished a job.

## 1. Maps provider

Use the Google Maps Platform connector (managed by Lovable — no Google account or billing needed to start). It covers everything needed for Johannesburg:

- **Places Autocomplete** — real Joburg addresses and suburbs as you type, restricted to South Africa and biased to the Gauteng area.
- **Geocoding** — turns a picked address into GPS coordinates.
- **Routes API** — travel times between stops, and optimal stop ordering for a van's day.
- **Maps JavaScript API** — the map itself.

Suburb names come from Google's own data (the "sublocality" of a picked address), so there is no static Joburg suburb list to maintain or go stale. Suburbs that come back get collected into a **Service areas** settings screen where you can mark a suburb as in-area / out-of-area / surcharge, and optionally pin it to a preferred van.

## 2. Address capture

Replace the free-text address fields with a Google address search box (with a "enter manually" fallback for complexes and estates that don't resolve). Applies in:

- Admin customer add/edit form
- Customer portal profile
- Pickup/drop-off and mobile grooming booking flows (address defaults to the customer's, editable per booking)

Behind the address we store the coordinates, the Google place id, the formatted address, suburb and city, plus a "complex/unit + gate code + access notes" field, which mobile crews need more than the street number.

Existing records are **not** bulk-processed. An address gets looked up and stored the moment someone saves that customer's profile, or books a mobile groom / pickup for them. If a booking is made against an address that has never been resolved, the booking form asks for the address to be confirmed on the map before saving.

## 3. Auto-assign to the nearest van

When a mobile grooming or pickup booking is created:

1. Find vans that are active that day and have a free slot for the requested duration (existing availability logic).
2. Ask the Routes API for drive time from each candidate van's last stop before that time (or its home suburb, first job of the day) to the new address.
3. Pick the van with the shortest added travel that still respects the min/max travel gap rules already in Van workflow settings.
4. Save the choice with a short reason ("Van 2 — 11 min from previous stop in Fourways") shown on the booking.

Staff can always override by reassigning on the Mobile vans board. Auto-assign is a setting (on by default) so you can switch it off.

## 4. Route view and re-optimise

On the Mobile vans page, add a **Map** view next to the existing timeline:

- Numbered pins per van in visit order, colour-coded by van, with the van's home suburb as start/end.
- Header shows total distance, total drive time and total on-site time per van.
- **Optimise order** button: re-sequences that van's stops via the Routes API and shows a before/after comparison ("saves 34 min"). Nothing moves until you accept. Stops already checked in are locked in place.
- Warnings for stops that are far outside the van's cluster, or an address with no coordinates yet.

## 5. GPS on start/stop

In Work Mode, tapping **Start** and **Complete** on a mobile job captures the device location (with a one-time permission prompt and a plain-English notice explaining why). We store the coordinates, accuracy and time, plus the distance from the customer's address.

The office sees, per job: started at 09:14 (42 m from address), completed at 10:31 (38 m from address) — or a flag if the ping was far away or refused. No background or continuous tracking.

## 6. Settings (per the settings-first rule)

- **Service areas** — suburb list built from real addresses; in-area / out-of-area / surcharge, optional preferred van, gated by a permission code.
- **Van workflow** (existing screen) — add: auto-assign on/off, max acceptable drive time to a new stop, on-site buffer, and whether GPS capture is required to complete a job.

## Technical notes

- Connect the `google_maps` connector. Browser key (`VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_BROWSER_KEY`) for the map and Places autocomplete; all Geocoding and Routes calls go server-side through the connector gateway from new edge functions (`geocode-address`, `van-route-optimise`, `van-auto-assign`) so no quota-bearing call is exposed to the browser.
- New columns on `customers`: `latitude`, `longitude`, `google_place_id`, `formatted_address`, `geocoded_at`, `access_notes`. Same trio of location columns on `transport_details` for per-booking pickup/drop-off addresses.
- New table `service_areas` (tenant-scoped, RLS, grants) for suburb rules; new table `job_location_pings` (booking, staff, kind start/complete, lat/lng, accuracy, distance-from-address).
- `bookings` gains `assignment_reason` text so the auto-assign explanation is visible in the UI.
- Route ordering uses `routes/directions/v2:computeRoutes` with `optimizeWaypointOrder`; nearest-van scoring uses `routes/distanceMatrix/v2:computeRouteMatrix`. Results cached per van per day to keep call volume low.
- Places Autocomplete uses the new `AutocompleteSuggestion` API with session tokens (not the deprecated legacy Places classes).

## Build order

1. Connect Google Maps + schema changes.
2. Address autocomplete in customer forms and portal profile, with geocode-on-save.
3. Mobile vans map view with per-van pins and route stats.
4. Auto-assign nearest van on booking + override.
5. Optimise-order button with accept/reject.
6. GPS ping on start/complete in Work Mode.
7. Service areas settings screen + new van workflow toggles.
