## Goal

Let staff waive vaccination requirements per pet for a limited period during the paper-records transition, and fix a real bug found in the vaccination check code.

## Confirmed bug (found while investigating)

The client-side check in `src/features/grooming/queries.ts` and `src/features/hotelCattery/queries.ts` queries `vaccinations.expires_on`. That column does not exist — the table has `expiry_date` (verified against the database). Every soft check at grooming/hotel check-in therefore fails with a 400 from Supabase. This will be fixed.

The specific 400 in your console screenshot is not yet confirmed to be this one (the console snapshot had expired by the time I looked). Step 1 is to reproduce the booking-detail page load in a browser and capture the failing request, then fix whatever it turns out to be.

## Per-pet, time-limited waiver

New columns on `pets`:
- `vax_waived_until` (date) — waiver expiry
- `vax_waiver_reason` (text)
- `vax_waiver_by` (profile id) and `vax_waiver_at` (timestamp) for audit

Any staff member with tenant access can set or clear it (no new permission code, per your answer).

While `vax_waived_until >= today`, every gate treats that pet's vaccination rows as satisfied:
- `grooming_can_confirm_booking` and `hotel_can_confirm_booking` return status `waived` instead of missing/expired
- the hard gate in `portal-create-booking` respects the waiver, so a waived pet can still be booked
- the soft check used by the grooming board and hotel Today panel treats waived pets as OK

## UI

**Pet detail (admin)** — inside the Vaccinations card:
- amber "Vaccination waiver" row when active: "Waived until 30 Sep 2026 — records on file (paper)", with Edit / Remove
- "Waive vaccinations" button opens a small dialog: until date (default +60 days), reason, save. Logged to activity.

**Vaccination gate panels** (booking detail, grooming + hotel) — waived pets render as a neutral "Waived until <date>" line instead of red/amber, and the panel header drops to "Vaccinations OK (waiver in place)" when the only issues are waivers.

**Pets list + Settings → Vaccination rules** — a "Waived" badge on pets with an active waiver, and a filter so Charlotte can see who still needs real certificates and chase them before waivers lapse.

## Technical notes

- One migration: add the four `pets` columns, then `CREATE OR REPLACE` the two `*_can_confirm_booking` functions with the waiver branch (unchanged signatures, so no grant changes).
- Waivers expire naturally by date — no cron needed.
- Existing `booking_status_events` override logging (`event_kind = 'vaccination_override'`) stays as-is for one-off check-in overrides.
