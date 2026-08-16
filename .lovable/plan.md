# Flag mobile/transport bookings that have no Google-verified address

## What the data says

A live query on the bookings table confirms the scale of the problem: of the mobile jobs from the last 30 days onward, **74 of 74 mobile grooming bookings and 25 of 25 pickup/drop-off bookings** have no linked service address at all (`service_address_id` and `service_place_id` are both empty). So today nobody in the system is told that a van has nowhere to drive to.

The plumbing already exists: bookings store `service_address_id`, `service_address_text` and `service_place_id` (copied from the customer address's `google_place_id` when one is picked), and `AddressField` already treats "has a `google_place_id`" as verified. What's missing is a consistent, loud warning wherever these bookings are seen, plus a worklist to clear the backlog.

## The rule

A booking **needs a routable address** when its service type is mobile grooming or pickup/drop-off. It is **routable** only when the booking points at a customer address that has a Google place id and coordinates. Everything else — no address, free-text address only, or a legacy address never verified with Google — counts as **address missing**, shown in the same bold red style.

## What gets built

### 1. One shared check
A small helper plus a query hook that, for any booking, answers: needs address? / is it routable? / why not (none linked, or linked but unverified). Used by every surface below so the wording and colour never drift.

### 2. Bold warning where the booking is worked on
- **Booking detail page** — a full-width red banner at the top: "This van job has no verified address. The van cannot be routed." with a **Fix address** button that opens the customer's address picker, and after saving re-links the booking.
- **Booking form modal** — when the service is mobile grooming or pickup/drop-off and the chosen address is unverified or absent, a red inline block above the save button. Saving is still allowed (front desk often books before the address is known) but requires ticking "Save without an address — I'll add it before the day".
- **Van board, transport board, grooming diary cards, calendar chips** — a red pin icon and "No address" pill on the card so it is obvious at a glance in the day view.
- **Work mode job page** — the existing "no service address" warning is upgraded to the same red treatment and tells the driver to call the office.

### 3. A worklist to clear the backlog
New admin page **Bookings needing an address** (linked from the bookings page and from Settings → Address verification), listing every future mobile/transport booking without a routable address: date, customer, pet, service, van, and a **Fix address** action that opens the Google address search for that customer, saves it to their profile, and stamps it onto the booking. A count badge on the sidebar/bookings tab keeps it visible until it's empty.

### 4. Dashboard alert
A red tile on the admin dashboard: "N van jobs in the next 14 days have no address" linking straight to the worklist.

## Deliberately not doing
No bulk/automatic backfill of legacy addresses — addresses get upgraded one at a time as staff touch them, as requested. No booking is blocked from being created.

## Technical notes
- New `src/features/bookings/addressGate.ts`: `bookingNeedsAddress(serviceType)`, `bookingAddressState(booking)` returning `routable | unverified | missing`, and `useBookingsMissingAddress(tenantId)` querying future bookings of the two service types joined to `customer_addresses` on `google_place_id`.
- Reuses `AddressField` / `AddressSelector` for the fix flow, and the existing `service_address_id` write path in `bookings/queries.ts` (which already copies place id and text) — no schema change and no migration.
- Warning styling uses existing coral/destructive semantic tokens, no hardcoded colours.
