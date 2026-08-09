# Capture unit / complex details on verified addresses

## The problem
When an address is verified against Google, we keep only what Google returns ("6 Waterloo Rd, Bryanston, Sandton, 2191"). The customer's own detail — "7 Bryanston Villa" (unit inside the complex) — is lost, because that line only exists in the manual-entry fields, which disappear once the address is verified. A van driver arriving at 6 Waterloo Rd has no idea which unit to go to.

## What we'll build

### 1. A "Unit / complex" line that survives verification
Add a small always-visible input directly under the verified address card:

```text
ADDRESS
 ⌖ 6 Waterloo Rd, Bryanston, Sandton, 2191
   Verified for routing   Change   Enter manually
 Unit / complex (optional)   [ 7 Bryanston Villa            ]
 Gate code / access notes    [ Buzz #12, dogs at side gate  ]
```

- Stored in the existing `address_line_2` (unit/complex) and `access_notes` (gate code, directions) columns — no schema change needed.
- Never sent to Google. Geocoding stays on the verified street address, so routing accuracy is unaffected.
- Plain-English helper text: "Flat, unit or complex name — helps our van find you."

### 2. Show it everywhere the address is shown
Everywhere we currently render an address, display the unit line above the street line:

- Customer detail → Addresses tab, and the customer edit modal
- Portal → My addresses, My profile primary address card
- Address picker in booking wizards (grooming, transport)
- Van/route stop cards and driver-facing lists, so the unit and access notes are visible on the road

Format used consistently: unit line first, then the verified Google address, then access notes as a muted second line.

### 3. Carry it into bookings and routing
- Booking address snapshots already copy `address_line_2`; confirm the unit line and access notes are captured at booking time so later edits to the customer record don't change historic bookings.
- Route stops display the unit/access text next to each stop; optimisation still uses the verified coordinates.

## Technical notes
- `AddressField.tsx`: add the unit + access-notes inputs to the verified-card branch (currently only present in manual mode), keeping values when switching between search and manual.
- `AddressValue` gains `access_notes`; callers (`CustomerFormModal`, `ConsentWizard`, `AddressFormDrawer`, portal pages) pass it through.
- Add one shared display helper (e.g. `formatAddressLines`) so every surface renders the unit/street/notes stack identically instead of ad-hoc `.join(", ")` calls.
- No migration: `customer_addresses.address_line_2` and `access_notes` already exist, and legacy `customers.address_line_2` stays in sync via the existing address sync.
