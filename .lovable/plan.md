# Fix the address field: one Google-backed address control

## What's wrong today

Confirmed by reading `src/lib/maps/googleMaps.ts` and `src/components/address/AddressAutocomplete.tsx`:

1. `ZA_BIAS` sends the bias circle in REST format (`{latitude, longitude}`) and includes a `region` key. The Maps JS `fetchAutocompleteSuggestions()` call expects a JS `Circle` literal (`{center: {lat, lng}, radius}`) and has no `region` field — so every keystroke throws `Invalid LocationBias`, which the component prints raw under the input. That is the red line in the screenshot.
2. The form shows the search box *and* six free-text address inputs (line 1/2, suburb, city, province, postcode) side by side, so users see and edit duplicated data.

## What gets built

### 1. Fix the bias so autocomplete actually returns results
- Rewrite `ZA_BIAS` as a valid JS-API request fragment: `includedRegionCodes: ["za"]` plus `locationBias: { center: { lat: -26.0567, lng: 28.0348 }, radius: 40000 }`.
- Keep `region=ZA&language=en-ZA` on the script URL (that part is correct).

### 2. Never show raw API errors to users
- `AddressAutocomplete` stops rendering exception text. Errors are logged to the console only; the UI shows a quiet, plain-English line ("Address lookup is unavailable right now — you can type the address instead") and falls back to a normal text input.

### 3. One address control instead of search + six inputs
New `AddressField` behaviour used by the customer form, the address drawer, and the portal:

```text
[ empty ]   Search for the address…            <- single Google search input
              |  pick a suggestion
[ chosen ]   87 Waterloo Rd, Bryanston,        <- selected address card
             Sandton, 2191, South Africa
             Verified for routing   Change   Enter manually
```

- After selection, the search input is replaced by a read-only card showing Google's `formattedAddress`, a green "Verified for routing" chip, and a "Change" action to search again.
- The parsed parts (line 1/2, suburb, city, province, postcode, place id, lat/lng) are stored exactly as they are now, but are no longer shown as editable inputs by default.
- "Enter manually" (staff only, hidden in the customer portal) reveals the existing detail inputs for the rare address Google can't find; that path is labelled "Not verified — van routing won't work for this address".
- Legacy customers whose stored address has no `google_place_id` open in the "manually entered" state with the same not-verified note, and a "Find on Google" button that runs the search prefilled with their current address.

### 4. Where it applies
- `src/features/customers/CustomerFormModal.tsx` (the screen in the screenshot)
- `src/features/customers/AddressFormDrawer.tsx`
- The portal address screen (`MyAddressesPage`), with the manual-entry escape hatch hidden

No changes to the database, the sync helpers, the backfill function, or booking snapshots — they already read the same fields.

## Verification
- Typing in the customer form returns Johannesburg suggestions with no red error text.
- Selecting one collapses the block to the single verified address card, and saving still writes place id, coordinates and the parsed parts.
- An existing unverified customer shows the manual state and can be upgraded via "Find on Google".
