# Wire Google Maps addresses into the customer portal

Right now only parts of the portal use the Google-backed address system. Verified gaps:

- **My profile** (`MyProfilePage.tsx`) still edits the old plain-text address fields on the customer record (Address line 1/2, suburb, city, province, postcode). Nothing here touches Google or `customer_addresses`, so a customer editing their address there silently diverges from the verified address book.
- **Grooming and Transport wizards** each hand-roll their own radio list of saved addresses instead of using the shared `AddressSelector` that staff screens use. They show no verification status and no map, and mobile grooming does not filter to mobile-serviceable addresses.
- **My addresses page** lists addresses and can add/edit via the Google-backed drawer, but shows no map preview and never prompts the customer to fix an unverified (legacy, imported) address.
- **Signup and registration** collect no address at all, so new portal customers arrive with nothing on file and hit "You don't have any saved addresses yet" mid-booking.

## What to build

1. **My profile → real address book**
   Replace the six plain-text inputs with the customer's saved addresses: show the primary address (formatted, with verified badge and small static map), plus "Manage addresses" linking to `/customer/addresses`. Editing opens the same Google-backed drawer used everywhere else. Stop writing the legacy customer address columns from the portal.

2. **Unified address picker in wizards**
   Swap the bespoke radio lists in the Grooming and Transport wizards for the shared `AddressSelector`, with `mobileOnly` filtering for mobile grooming. Same look, same add-new drawer, verification badge visible.

3. **Verify-your-address nudge**
   On My addresses (and inline in the wizards), an unverified address shows a gentle "Confirm this address" action that opens the drawer with Google search pre-filled from the stored text, so customers self-heal imported records. No raw API errors ever shown — falls back to manual entry silently.

4. **Address at signup/registration**
   Add an address step to the portal registration flow using the same Google search field, saved as the customer's primary address.

5. **Map preview**
   Small static map thumbnail on each saved address card (portal and staff), using the stored coordinates — no extra API cost per view beyond static maps.

## Technical notes

- Reuse existing `AddressField`, `AddressFormDrawer`, `AddressSelector`, `AddressVerifyBadge`, and `addressQueries` — no new address components except a `StaticMapThumb`.
- Static maps via the existing browser key (`VITE_GOOGLE_MAPS_BROWSER_KEY`); confirm Maps Static API is enabled, otherwise the thumbnail degrades to a plain pin icon.
- Portal writes continue through `customer_addresses` with existing RLS; the one-primary trigger already handles primary switching.
- Legacy `customers.address_*` columns stay read-only for now (used by older reports) — a later cleanup can drop them once nothing reads them.
