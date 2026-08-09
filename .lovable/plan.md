# Phase C — Google Places address autocomplete & address management

Phase C wires Google Places API (New) into customer addresses so staff and portal customers can pick verified South African addresses, capture Place IDs + coordinates, and manage multiple addresses per customer.

## Already done

- Browser key loaded in `.env` as `VITE_GOOGLE_MAPS_BROWSER_KEY`.
- `AddressAutocomplete` component using Places API (New) with Gauteng bias and session tokens.
- `addressQueries.ts` hooks for CRUD on `customer_addresses`.
- `AddressFormDrawer` for adding/editing addresses with autocomplete.
- Admin "Addresses" tab on `CustomerDetailPage`.
- Portal "My addresses" page + sidebar nav item.

## Still to do

### 1. Geocode backfill for legacy addresses
- Staff-only edge function `backfill-addresses` that reads existing `customer_addresses` rows missing `google_place_id`, calls Places `searchText` / Geocoding to find the best match, and writes `google_place_id`, `latitude`, `longitude`, and a cleaned `formatted_address`.
- Gated to users with a new permission code (e.g. `settings:manage`) and run from a button in Settings → Addresses / Data tools.
- Idempotent: skip rows already verified; log count processed.

### 2. Booking snapshot wiring
- When a booking is created, copy the selected customer's primary address (or chosen service address) into the `bookings` snapshot columns: `service_address_id`, `service_address_text`, `service_place_id`, `service_suburb`, `service_city`, `service_postcode`.
- For transport bookings, also snapshot `pickup_address_id` / `dropoff_address_id` into `transport_details`.
- Update `portal-create-booking` and staff booking flows to capture the address at creation time.

### 3. Address selector in booking flows
- Mobile grooming / transport wizards get an address picker that lists the customer's `customer_addresses` (with mobile-grooming flag shown).
- Default to the primary address; allow adding a new address inline.

### 4. Polish & validation
- Ensure `is_primary` logic: only one primary address per customer; setting a new primary clears the old one.
- Confirm `customer_addresses` RLS allows staff and the owning customer to CRUD.
- Add a settings screen for "Address verification" with the backfill button and last-run stats.

## Not in this phase
- Route optimisation (Phase D).
- Van assignment or travel-time availability.

## Verification
- Type-check passes.
- Admin customer detail shows Addresses tab with add/edit/delete.
- Portal sidebar shows Addresses and the page loads authenticated.
- Backfill edge function self-test returns processed count and any errors.
