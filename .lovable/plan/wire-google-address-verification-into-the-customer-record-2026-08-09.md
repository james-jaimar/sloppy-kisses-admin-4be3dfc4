# Wire Google address verification into the customer record

## What's wrong today
- The Edit customer modal still has six plain text boxes (line 1, line 2, suburb, city, province, postcode) with no Google lookup, and it writes only to the old `customers` address columns. Nothing flows into the new `customer_addresses` table used for routing.
- Every one of the 1,552 migrated addresses is still unverified: 0 have a Google Place ID and 0 have coordinates, so van routing has nothing to work with yet.
- The backfill tool exists in Settings but only does 25 addresses per click — roughly 62 clicks to finish, with no progress memory.
- Nothing in the UI tells staff an address is old or unverified.

## What we'll build

### 1. Edit customer uses the Google address picker
Replace the loose address boxes in the New/Edit customer modal with the Google address search already used elsewhere:
- Type-ahead biased to Johannesburg; picking a result fills line 1/2, suburb, city, province, postcode and captures the Place ID and coordinates.
- Manual typing still allowed (plots and farms often don't match) — it just saves as unverified.
- Saving writes to both places: the old customer fields (so nothing else breaks) and the customer's primary row in the new address book.
- Status line under the field: green "Verified for routing" or amber "Not verified — search and re-pick to enable van routing".

### 2. Visible "needs updating" flags
- Amber "Unverified address" chip on the customer detail header and on each unverified card in the Addresses tab, with a one-click "Verify with Google" button that geocodes that single address on the spot.
- Same chip in the customer portal's Addresses page so customers can fix their own.

### 3. Backfill the 1,552 existing addresses properly
- Upgrade Settings > Address verification to run continuously: it keeps calling the backfill in batches until nothing is left, with a live progress bar (X of Y verified, N failed) and a stop button.
- Counter at the top: total, verified, unverified, failed.
- Failures (no Google match) are listed with the customer name and a link so they can be fixed by hand; they're marked so repeated runs skip them, with a "retry failures" option.

### 4. Keep the two in sync going forward
Whenever a customer's primary address changes (staff edit, portal edit, address drawer), the legacy `customers` address columns are refreshed from it, so search, invoices and PDFs keep showing the right thing.

## Technical notes
- `AddressAutocomplete` and `AddressFormDrawer` already exist and work; the customer modal reuses `AddressAutocomplete` directly.
- Write path in `src/features/customers/queries.ts`: after upserting the customer, upsert the primary `customer_addresses` row (place id, lat/lng, formatted address) and mirror the text fields back to `customers`.
- `backfill-addresses`: keep BATCH_SIZE 25 per invocation for Google pacing but return a `remaining` count so the UI can loop; migration adds `verification_failed_at` / `verification_error` on `customer_addresses` so failures are skippable and reportable.
- Single-address verify: same edge function with an optional `address_id` parameter, called from the "Verify with Google" button.
- No change to booking address snapshots — they already read `customer_addresses`.