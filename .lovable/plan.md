
# Portal-only customer bookings

Charlotte's book of business is ~95% repeat customers, so we go with **Portal only** now and defer public storefront pages. Everything a customer books happens after login inside `/customer/*`, lands as a `booking_requests` row (`source='customer_portal'`), and staff triage it in the existing Booking Requests queue. This keeps one funnel, respects vaccination rules, and avoids double booking.

## What we're building

A service-picker driven request flow — one polished wizard per service, tuned to what that service actually needs — replacing the current generic "New booking request" modal on the portal.

### 1. Portal entry point
- `/customer/bookings/new` becomes a **service picker** (5 tiles): Hotel, Daycare, In-house Grooming, Mobile Grooming, Pick up / Drop off.
- "Request booking" buttons on `MyBookingsPage` and Dashboard route here.
- Each tile → dedicated wizard route (`/customer/bookings/new/hotel`, `/daycare`, etc.).

### 2. Per-service wizards (shared shell, service-specific steps)

All wizards share: pet selector (multi where sensible), notes, review & submit; all write to `booking_requests` with `service_type`, `preferred_start_at/end_at`, and a `request_payload` jsonb capturing service-specific choices staff can see in the queue.

- **Hotel & Cattery** — pick pet(s), check-in date+time, check-out date+time, room-type preference (dog / cat / suite — pulled from resources), optional add-ons (grooming, extra walks) from settings, special-diet/medication notes.
- **Daycare** — pick pet(s), one date OR date-range (multi-day picker), preferred drop-off/pick-up time, optional add-on (bath, nail trim), assessment flag if pet is new. Uses plan/day-pack info from `daycare_plans` if attached.
- **Grooming (in-house)** — pick pet, preferred date, preferred time-of-day window (morning / afternoon), package from `grooming_packages` (settings-driven), add-ons list, notes.
- **Grooming (mobile)** — same as in-house PLUS address confirmation (prefilled from customer address, editable per-request), parking/access notes. Van assignment stays a staff decision.
- **Pick up / Drop off** — pick pet(s), tie to an existing booking OR standalone; direction (pickup / dropoff / both), address (prefilled), preferred window, linked service booking id if applicable.

### 3. Vaccination pre-flight
- Before submit, check each selected pet's vaccination status against tenant `vaccination_rules` (already in DB).
- If expired/missing, show inline warning with an "Upload vaccine now" link (existing `/customer/documents` upload flow). Submit is still allowed but the request is flagged in `request_payload.vax_warnings` so staff see it in the queue.

### 4. Existing "Request change / Request cancel" flows on `MyBookingDetailPage` stay unchanged — they already write to `booking_requests` with `kind='change'|'cancel'`.

### 5. Staff side (small touch-ups)
- Booking Request queue: render `request_payload` in the drawer so staff see room type / package / add-ons / address without needing to phone the customer.
- No new tables, no new statuses — `pending → approved | needs_info | rejected` still applies.

### 6. Confirmation & comms
- On submit → toast + redirect to `/customer/bookings` (Upcoming tab shows the request as `pending`).
- Fire `booking_request_submitted_customer` notification event (email confirmation to the customer) — event exists in the catalog, needs the template.
- Existing staff-side "new booking request" notification already fires.

## What we're NOT doing (deferred)
- Public/anonymous storefront pages
- Real-time availability / live calendar picking (still request → staff-approves)
- Cart or bundle-multiple-services-in-one-checkout
- Self-serve payment at time of request (payment happens via existing invoice → PayFast flow after staff issues the invoice)

## Technical notes
- New files: `src/features/customerPortal/bookings/new/ServicePickerPage.tsx`, plus one wizard file per service (`HotelRequestWizard.tsx`, `DaycareRequestWizard.tsx`, `GroomingInhouseRequestWizard.tsx`, `GroomingMobileRequestWizard.tsx`, `TransportRequestWizard.tsx`), and a shared `WizardShell.tsx` + `VaxPreflight.tsx`.
- Reuse existing `booking_requests` queries; extend insert to include `request_payload` jsonb.
- Reuse settings-driven catalogs already in place: `resources` (rooms/suites), `grooming_packages`, `grooming_addons`, `daycare_plans`, `vaccination_rules`.
- Routes wired in `src/App.tsx` under `RequireCustomer`.
- Remove/repurpose the current generic `NewBookingRequestModal` — replace calls with the new picker.
- One migration: extend `booking_requests` with `request_payload jsonb DEFAULT '{}'::jsonb` if not already present, and add `booking_request_submitted_customer` template row.

## Suggested build order
1. Migration + shared `WizardShell` + service picker page + route wiring
2. Hotel wizard (most complex — sets the pattern)
3. Daycare wizard
4. Grooming in-house + mobile (share ~80% of code)
5. Transport wizard
6. Vax preflight + staff drawer `request_payload` renderer + customer confirmation email template

Approve and I'll start on step 1.
