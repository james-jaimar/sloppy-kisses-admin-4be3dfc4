# Phase C — Google Places autocomplete on addresses

Add a reusable address autocomplete to customer and booking flows, capture canonical Place IDs and coordinates, and store them in the `customer_addresses` table created in Phase B.

## What gets built

### 1. Reusable browser autocomplete component
- `src/components/address/AddressAutocomplete.tsx`
- Uses Google Places API (New) `AutocompleteSuggestion.fetchAutocompleteSuggestions()`
- Biased to Gauteng / Johannesburg via `ZA_BIAS` in `src/lib/maps/googleMaps.ts`
- Returns: `place_id`, `formatted_address`, plus `addressComponents` and `location` fetched via Place Details
- Falls back gracefully to a plain text input when `VITE_GOOGLE_MAPS_BROWSER_KEY` is missing

### 2. Address form / drawer
- Add "Addresses" tab to `CustomerDetailPage.tsx`
- List existing `customer_addresses` with label, type, primary flag, and formatted address
- "Add address" / "Edit address" drawer using the autocomplete
- Fields: label, address_type, is_primary, is_mobile_grooming_address, access_notes, parking_notes, gate_code
- On save, write `google_place_id`, `latitude`, `longitude`, `formatted_address`, and parsed suburb/city/postcode from Place Details

### 3. Portal self-service
- Same address list + add/edit in the customer portal (`/portal/profile` or new `/portal/addresses`)
- Portal users can only see/edit their own addresses via existing `current_customer_id(tenant_id)` RLS

### 4. Seed existing addresses with Place IDs (optional, async)
- Edge function `geocode-addresses` (staff-only) that takes the 1,552 backfilled `customer_addresses` rows without `google_place_id` and fills them using Geocoding API + server key
- Runs in batches with a cursor; idempotent (skips rows that already have a place_id)
- Not run automatically — triggered from a button in Settings → Data tools

### 5. Booking snapshot wiring (additive only)
- When a booking uses an address, copy `google_place_id`, `latitude`, `longitude`, and `formatted_address` into the booking snapshot columns added in Phase B
- Keeps bookings independent even if the customer address is later edited

## Explicitly not in this phase
- Route optimization UI or van routing screens
- Mobile grooming address assignment logic
- Changes to existing free-text address columns on `customers` or `transport_details`

## Verification
- Browser console shows no `RefererNotAllowedMapError` or `REQUEST_DENIED` for Places API (New) calls
- Staff can add/edit a customer address and see Place ID + coordinates saved
- Portal customer can add/edit their own addresses
- `geocode-addresses` edge function compiles and can be invoked by staff
