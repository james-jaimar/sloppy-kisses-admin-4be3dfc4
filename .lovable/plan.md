# Recon report — Google address + van route planning (no changes made)

Inspection only. No code or database was changed.

## 1. Customers

Table `public.customers` (46 cols), tenant-scoped via `tenant_id`, RLS pattern `user_has_tenant_access(tenant_id)`.

Address fields today (flat, on the customer row):
`home_address`, `work_address`, `address_line_1`, `address_line_2`, `suburb`, `city`, `province`, `postcode`.

Not present: `google_place_id`, `latitude`, `longitude`, `formatted_address`, `country_code`, and there is no `customer_addresses` table. So one address per customer, free text, no geocoding.

UI: `src/features/customers/CustomerDetailPage.tsx` (Customer 360), the customer edit drawer, and the portal profile page.

## 2. Bookings

`public.bookings` (35 cols) — one row per booking, typed detail rows per service.
Relevant columns: `service_type` (enum incl. `grooming_inhouse`, `grooming_mobile`, `pickup_dropoff`), `status`, `start_at`/`end_at`, `start_date`/`end_date`, `resource_id`, `assigned_staff_id`, `customer_id`, `recurring_rule_id`.

Mobile grooming is identified by `service_type = 'grooming_mobile'` (constant `MOBILE_SERVICE_TYPES` in `src/features/mobileVans/queries.ts`).

No address columns on bookings at all — the van board reads the customer's `suburb` only. No `service_address_id`, no route sequence, no planned arrival.

`public.transport_details` (pickup/drop-off) does hold free-text `pickup_address`, `dropoff_address`, `suburb`, `gate_code`, `planned_window_start/end` — same gap: no place ID or coordinates.

## 3. Grooming services and duration

`public.grooming_packages`: `code, name, species, size_band, package_type, price_zar, expected_minutes, active, sort_order`.
So **duration already exists** as `expected_minutes` per package.

`public.grooming_booking_details`: `package_id`, `duration_minutes`, `grooming_mode`, `travel_fee`, actual start/end, surcharges, stay-and-play. Booking length is derived from the package's `expected_minutes` (default 60) in `BookingFormModal.tsx`.

## 4. Vans

No dedicated van table. Vans are rows in `public.resources` with `type = 'mobile_van'`:
`name, description, capacity, active, sort_order, home_suburb`.

Missing for routing: start/end location (only a text `home_suburb`), no registration, no per-van workday window, no colour.

Van hours live globally in `public.van_workflow_settings`: `min_travel_gap_minutes`, `max_travel_gap_minutes`, `day_start_time`, `day_end_time` — one row per tenant, not per van.

Assignment: `bookings.resource_id`, set from the van board via `useAssignBookingToVan`, guarded by RPC `van_can_assign_stop` (overlap check only — no travel time).

UI: `src/features/mobileVans/` — `MobileVansPage.tsx`, `VanTimeline.tsx`, `UnassignedStrip.tsx`, `RouteSummary.tsx` (currently a non-geographic summary).

## 5. Edge functions

31 functions in `supabase/functions/`. Booking/availability relevant: `portal-create-booking`. Nothing calls any mapping or geo service today. Availability is computed in Postgres RPCs (`grooming_day_availability`, `hotel_day_availability`, `daycare_day_availability`).

Shared helpers live in `supabase/functions/_shared/` (e.g. `s3.ts`, `payfast.ts`, `auth-email.ts`) — that is where a `google.ts` auth/proxy helper would belong.

## 6. RLS pattern to follow

Every tenant table: `GRANT` to `authenticated` + `service_role`, `ENABLE ROW LEVEL SECURITY`, then a staff policy `using (user_has_tenant_access(tenant_id))`. Customer-facing tables add a second policy scoped through `current_customer_id()`. Portal reads of settings-style tables (rate cards, plans, surcharges) were recently opened to authenticated tenant members — new address tables need the same treatment or the portal cannot read them.

## 7. Portal

`src/features/customerPortal/` — Supabase auth, `profiles.user_type = 'customer'`, linked via `customers.linked_profile_id`. Booking wizards in `bookings/new/` (`GroomingRequestWizard.tsx`, `useBookingSubmit.ts`) create confirmed bookings through the `portal-create-booking` edge function.

## 8. Grooming admin/calendar components

`src/features/grooming/` (in-house board, `GroomingCard.tsx`), `src/features/mobileVans/` (van day board), `src/features/calendar/CalendarWeekView.tsx`, `src/features/bookings/BookingFormModal.tsx` (slot picker driven by `grooming_day_availability`).

## Recommended minimal schema changes (not applied)

- New `public.customer_addresses` (tenant_id, customer_id, label, structured lines, `formatted_address`, `google_place_id`, lat/lng, `is_primary`, access/parking notes) — backfill from `customers.address_line_1/suburb/city/postcode`. Keep the existing `customers` columns as-is for now to avoid breaking Customer 360, Xero sync and invoice PDFs; treat `customer_addresses` as the new source of truth for routing.
- Add to `bookings`: `service_address_id`, `service_address_text`, `service_place_id` (snapshot at booking time).
- Extend `resources` for `mobile_van` rows rather than creating a new van table: `start_place_id`, `end_place_id`, `workday_start`, `workday_end`, `colour`, `registration`. Keeps `bookings.resource_id`, the van board and `van_can_assign_stop` working unchanged.
- New `grooming_route_runs` + `grooming_route_stops` for optimisation previews and apply/audit.
- No change needed for durations — `grooming_packages.expected_minutes` is already there.

## Also worth flagging

- The business operates in **Bryanston, Johannesburg**, not Cape Town — Places autocomplete should bias to Gauteng/ZA.
- Pickup/drop-off (`transport_details`) has the same address problem and should ride on the same `customer_addresses` work.
- Google access: this would be built with a plain Google Cloud project (browser key + service account in Supabase secrets), not the Lovable Google Maps connector, so it survives the move to AWS Amplify.

## Next step

Nothing is implemented until you come back with the migration + prompt sequence. Phase B (addresses) is the safe first build.