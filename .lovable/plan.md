## Sprint 2 — Hotel & Cattery to daycare parity

Daycare is the reference. Every hotel/cattery booking should travel the same path end-to-end:

```text
Request (portal or admin)
  → Convert to Booking (bookings + hotel_booking_details)
    → Resource assigned (kennel / run / cattery pen)
      → Status transitions logged in booking_status_events
        → Vaccination gate before confirm
          → Auto draft invoice line "Hotel stay — {pet} · {nights} nights"
            → Visible on Customer detail (Bookings + Invoices)
              → Visible on Customer portal
                → Comms fired at each key step
```

Current state (verified this turn):
- `hotel_booking_details` table exists; `hotel_details_auto_invoice` trigger already fires but inserts the "Hotel stay" line with **unit_price = 0** — no rate card wired.
- `HotelBoardPage` renders occupancy but has no create/edit flow of its own.
- `BookingFormModal` supports `hotel_dog` / `hotel_cat` with `HotelFields`, so the admin form exists.
- `HotelRequestWizard` (customer portal) writes to `booking_requests` with a `request_payload` JSONB; `BookingRequestQueue` can flip status to `converted` but there is **no dispatcher that opens the booking modal pre-filled from the payload**.
- No vaccination gate is enforced on confirm for hotel today (grooming has one — mirror that pattern).

### What we'll build

**1. Hotel rate card (Settings)**
- New `hotel_rate_cards` table: tenant, species (dog/cat), accommodation type (e.g. `standard_kennel`, `luxury_kennel`, `cattery_pen`), nightly rate ZAR, optional weekend/peak uplift %, extra-pet-in-same-room rate.
- New `hotel_surcharges` table for named add-ons: bath on checkout, medication admin, single-feed, transport handover — each with a price.
- Settings page `Admin → Settings → Hotel rates` with CRUD, gated by `settings.manage`.

**2. Auto-invoice trigger uses the rate card**
- Rewrite `hotel_details_auto_invoice`: look up nightly rate by tenant + species + `accommodation_type`, multiply by nights, apply peak uplift where dates fall in a peak window, add extra-pet lines, add selected surcharges.
- Update the trigger to also re-fire on `UPDATE` when `accommodation_type`, `start_date`, `end_date`, or surcharge selections change (strip old draft lines for that booking first).
- Backfill existing zero-priced hotel lines behind a one-shot admin action, not automatically.

**3. Vaccination gate on confirm**
- Reuse existing `vaccination_rules` (already scoped per service). Add rows for hotel_dog / hotel_cat.
- Server-side check in a new RPC `hotel_can_confirm_booking(p_booking_id)` that returns missing/expired vaccine names.
- UI: block status transition to `confirmed` in `BookingDetailPage` when the check fails; show which vaccinations are missing with a link to the pet's Vaccinations tab. Admin override with a note is allowed (writes to `booking_status_events` with `event_kind = 'gate_overridden'`).

**4. Status flow + comms**
- Statuses used: `pending → confirmed → checked_in → checked_out → completed` plus `cancelled`. Every transition writes to `booking_status_events`.
- Add hotel comms templates (message_templates) with placeholders:
  - `hotel_booking_confirmed`
  - `hotel_arrival_reminder_t24h`
  - `hotel_checked_in`
  - `hotel_checked_out_receipt`
  - `hotel_cancelled`
- Emissions go through the existing `notification_events` pipeline; scheduler picks up the T-24h reminder.
- Show a small comms strip in `BookingDetailPage` (already present for other services) — verify hotel bookings render it and that "Send now" resends the last template.

**5. Convert-request → Booking dispatcher**
- New helper `openBookingModalFromRequest(request)` in `src/features/bookingRequests/`.
- For hotel/cattery requests it opens `BookingFormModal` pre-filled from `request_payload`: customer, pet(s), start_date, end_date, accommodation_type, surcharges, admin_notes.
- On save it calls the existing `useConvertRequest` mutation to set request status to `converted` and link `converted_booking_id`. Fires `hotel_booking_confirmed` comms.
- Wire it in `BookingRequestQueue` for `hotel_dog` and `hotel_cat` service types (other services will reuse the same dispatcher in Sprints 3–4).

**6. Customer 360 + Portal visibility**
- `CustomerDetailPage → Bookings tab`: verify hotel bookings show `start_date/end_date`, resource name, status pill; add night count.
- `MyBookingsPage` (portal): filter chip for "Hotel"; render nightly cost preview from rate card once the resource is picked.
- `MyBookingDetailPage`: show hotel_booking_details fields — accommodation type, feeding schedule, medication notes, pickup contact.

**7. Hotel Board polish**
- Occupancy cells become clickable → open the booking (already partial). Add "Vacant — book" affordance that opens `BookingFormModal` with resource + dates pre-filled.
- Today panel: separate "Arrivals today" and "Departures today" lists with pet + owner links.

### Order of work

1. Migration: `hotel_rate_cards`, `hotel_surcharges`, updated `hotel_details_auto_invoice`, `hotel_can_confirm_booking` RPC, peak window column on `hotel_workflow_settings`.
2. Settings page for rate cards + surcharges.
3. Rewire admin `BookingFormModal` hotel branch to price preview from rate card.
4. Vaccination gate wiring in `BookingDetailPage` transitions.
5. `openBookingModalFromRequest` dispatcher and wire it into `BookingRequestQueue` for hotel.
6. Comms templates + T-24h scheduler entry.
7. Hotel Board polish + customer detail / portal display checks.

### Technical notes
- All new tables get `GRANT SELECT, INSERT, UPDATE, DELETE ... TO authenticated` + `GRANT ALL ... TO service_role`, RLS on, policies scoped via `has_role` / tenant membership — same shape as daycare rate card tables.
- Trigger rewrites are `SECURITY DEFINER` with `search_path = public`, and `REVOKE ALL ... FROM PUBLIC, anon, authenticated` (matching existing style).
- Convert-request dispatcher is generic on purpose so Sprints 3–4 plug grooming + transport into the same entry point.
- No changes to Xero export shape — new lines flow through the existing `invoice_items` schema and inherit VAT from Slice 3.

### Explicitly NOT in this sprint
- Grooming, mobile van, or pickup/dropoff parity — those are Sprints 3 and 4.
- New payment behaviour — money loop was closed in the previous four slices.
- Redesigning the occupancy grid (out of scope; polish only).
