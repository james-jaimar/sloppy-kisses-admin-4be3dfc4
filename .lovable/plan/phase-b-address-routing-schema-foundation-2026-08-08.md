# Phase B — Address & routing schema foundation

Database only. No Google APIs, no UI changes, no behaviour changes.

## What gets built

### 1. New table: `customer_addresses`
One reusable address record per customer location (home, work, service, pickup, dropoff, other), ready for Google Place IDs and coordinates later.

- Identity: `id`, `tenant_id`, `customer_id` (cascade delete), `label` (default 'Home'), `address_type`
- Address: `address_line_1/2`, `suburb`, `city`, `province`, `postcode`, `country_code` default `'ZA'`, `formatted_address`
- Google-ready (left empty this phase): `google_place_id`, `latitude`, `longitude`
- Operational: `is_primary`, `is_mobile_grooming_address`, `access_notes`, `parking_notes`, `gate_code`
- Audit: `created_at`, `updated_at` with the project's existing `set_updated_at()` trigger
- Indexes: `tenant_id`, `customer_id`, `google_place_id`, `(customer_id, is_primary)`
- No uniqueness constraints yet

Access rules:
- Staff of the tenant can view, add, edit and remove addresses for their tenant (via `user_has_tenant_access`)
- A signed-in portal customer can view, add, edit and remove only their own addresses (via `current_customer_id(tenant_id)`)
- Cross-tenant access is impossible; background services keep full access as per existing convention

### 2. Backfill from existing customers
- 4,086 customers exist; **1,552** have meaningful address text and will get one row each
- The remaining ~2,534 with blank addresses are skipped — no empty rows
- Created as `label = 'Home'`, `address_type = 'home'`, `is_primary = true`, `is_mobile_grooming_address = true`, `country_code = 'ZA'`
- `formatted_address` is assembled only from parts that actually exist
- No coordinates or Place IDs are invented
- Re-run safe: skips any customer that already has a primary home address
- Existing `customers` address columns are read only, never modified

### 3. `bookings` — snapshot columns (all nullable, additive)
`service_address_id` (→ customer_addresses), `service_address_text`, `service_place_id`, `service_suburb`, `service_city`, `service_postcode`.
Nothing writes to them yet.

### 4. `transport_details` — additive columns
`pickup_address_id`, `dropoff_address_id` (→ customer_addresses), `pickup_place_id`, `dropoff_place_id`.
All existing free-text fields (`pickup_address`, `dropoff_address`, `suburb`, `gate_code`) stay exactly as they are and remain the live source.

### 5. `resources` — van fields (additive, nullable)
`start_place_id`, `end_place_id`, `start_address_text`, `end_address_text`, `workday_start`, `workday_end`, `colour`, `registration`.
No separate vans table; `home_suburb` stays. `van_workflow_settings` remains the fallback for hours.

### 6. Route optimisation tables (empty for now)
- `grooming_route_runs`: `tenant_id`, `route_date`, `status` (draft / optimised / applied / discarded / failed), `created_by`, distance and travel totals, Google request/response metadata, `applied_at`, `applied_by`
- `grooming_route_stops`: `route_run_id` (cascade), `resource_id`, `booking_id`, `stop_sequence`, `planned_arrival`, `planned_departure`, `travel_seconds`, `travel_distance_meters`
- Staff-only tenant access; no portal access
- Indexed on tenant + date, and run + sequence

## After the migration
- Supabase TypeScript types regenerate automatically; only compile errors caused by the new schema get fixed
- No screen, form or query behaviour changes

## Validation report you will get back
- Migration filename(s), tables created, columns added, policies created
- Rows backfilled vs customers skipped for having no address
- SQL checks: customer count, address count, customers with more than one address, orphaned or tenant-mismatched addresses, bookings carrying a `service_address_id`, and policy presence per new table
- Confirmation that legacy address columns are untouched and the app still compiles

## Explicitly not in this phase
Google Places/Routes/Route Optimization calls, edge functions, autocomplete UI, geocoding legacy addresses, availability or van-assignment logic changes.
