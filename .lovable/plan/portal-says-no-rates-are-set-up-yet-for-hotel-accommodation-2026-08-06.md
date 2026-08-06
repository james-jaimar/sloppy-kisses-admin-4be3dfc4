# Portal says "No rates are set up yet" for hotel accommodation

## What's actually wrong

The rate cards are configured correctly — the customer simply isn't allowed to read them.

`hotel_rate_cards` has one read rule, and it requires the reader to be a staff member of the tenant. A portal customer is not a tenant user, so the query returns an empty list and the wizard shows "No rates are set up yet — please contact us to book."

This is confirmed by comparison: grooming packages have a second read rule specifically for portal customers (active rows, own tenant), which is why the grooming wizard prices fine while the hotel one does not.

Two more portal lookups sit on the same trap:
- `daycare_plans` — staff-only read rule, but the portal daycare wizard reads it.
- `hotel_surcharges` — staff-only read rule (used if/when the portal shows extras).

## The fix

Add a customer read rule to `hotel_rate_cards`, mirroring the grooming packages pattern: a signed-in portal customer may read active rate cards belonging to their own tenant, and nothing else. Do the same for `daycare_plans` and `hotel_surcharges` so the daycare wizard and any hotel extras don't hit the same wall.

No frontend changes are needed — the wizard already filters by species and pet size band and will populate as soon as the rows are visible.

## Verification

After the change, open the portal hotel wizard: the Accommodation dropdown should list Hotel, Cabanas, Puppy & Small Breeds Area (size-gated by the pet), each with its nightly rate, and the live estimate should appear.

## Technical notes

Migration adds, per table, a `SELECT` policy for `authenticated` of the form used by `grooming_packages_customer_select`:
`active AND tenant_id IN (SELECT c.tenant_id FROM customers c WHERE c.linked_profile_id = current_profile_id())`.
Existing staff policies stay untouched; grants are already in place.
