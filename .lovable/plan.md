# Sprint 5 — Cross-service convert-request dispatcher

Turn the per-service "Convert" wiring (added ad-hoc in Sprints 2–4) into one reusable path that every service type uses, so the four portal wizards all funnel through a single, predictable admin flow.

## Current state (verified)
- `BookingRequestQueue` already opens `BookingFormModal` with a minimal prefill: `customer_id`, first `pet_id`, `service_type`, `start_at`, `booking_request_id`.
- On save it calls `useMarkRequestConverted` → sets `status='converted'`, `converted_booking_id`, `reviewed_at/by`.
- Portal wizards write rich data into `booking_requests.request_payload` (hotel dates + room, grooming package + addons, mobile suburb, transport direction/addresses, daycare days) — none of it flows into the booking today.
- No `booking_created` notification event is fired from the convert path.

## What Sprint 5 delivers

### 1. `buildBookingPrefillFromRequest(request)` helper
Single pure function in `src/features/bookingRequests/convert.ts` that maps a `BookingRequestListRow` → `BookingFormModal` prefill, per service type:
- `hotel_dog` / `hotel_cat`: start/end, room/resource, pets[], special requests → hotel details prefill.
- `grooming_inhouse`: preferred date/time, package id, addon ids, groomer preference.
- `grooming_mobile`: same + pickup suburb + address.
- `pickup_dropoff`: direction, suburb, pickup/dropoff addresses, linked service booking id if present.
- `daycare` / `daycare_assessment`: enrolment day(s), plan hint.

Extends `BookingFormModal`'s `prefill` prop with the typed detail fields it already writes on save, so the same modal handles every service with no new UI branches.

### 2. Unified convert action
- `BookingRequestQueue` continues to be the single entry point — no per-service branches.
- Replaces the current inline prefill block with `prefill={buildBookingPrefillFromRequest(selected)}`.
- Removes the mobile/transport ad-hoc convert wiring noted in Sprint 4 §4 (superseded).

### 3. `booking_created` notification event
- On successful convert, insert a `notification_events` row (`event_code='booking_created'`, `booking_id`, `customer_id`, channel resolved from `customers.notify_email/sms/whatsapp`). Uses the existing dispatcher; template body is Sprint 7.
- Fired from the same `onSaved` callback, after `markConverted` succeeds, so it only fires for real conversions (not manual admin bookings — those get their own event later).

### 4. Decline / needs-info parity
Small cleanup so the queue's non-convert actions also emit events:
- `booking_request_declined` when status → `declined`.
- `booking_request_info_requested` when status → `needs_info`.
Both use `admin_notes` as the message body hint.

### 5. Idempotency + audit
- `useMarkRequestConverted` already guards with `.neq('status','converted')`. Add a matching DB-level unique partial index on `booking_requests(converted_booking_id)` where not null, so a request can never point at two bookings.
- Log convert / decline / needs-info transitions to `activity_log` (`entity='booking_request'`).

## Out of scope
- Comms template bodies for the new event codes (Sprint 7).
- Admin-initiated `booking_created` event on manual bookings (separate small task).
- Redesign of `BookingFormModal` field layout.

## Technical notes
- One migration: unique partial index + activity_log trigger on `booking_requests` status changes; four-step template not needed (no new table).
- All prefill mapping is client-side, typed against the existing `*_booking_details` insert shapes already used by `BookingFormModal`.
- No hardcoded colors; no new settings screen needed (dispatcher is infrastructure, not user-tunable).

Say **"go"** to build, or tell me which item to drop / re-order.
