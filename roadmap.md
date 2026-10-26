# Roadmap — Charlotte's grooming snags (25 Oct 2026)

- [x] Slice 1a: Date edit sticks — picking a new day in the grooming slot picker now moves the booking, keeping the chosen time
- [x] Slice 1b: Repeat invoices dated per service date (advance bookings issue/due on service date; same-day keeps payment terms); grooming invoice lines show the service date
- [x] Slice 1c: Booking form flow reordered — package/extras → day & time → grooming sheets → repeats → vaccination/health checks at the bottom
- [x] Slice 1d: Printed parlour sheets now include each dog's detailed grooming brief (per-group choices + notes)
- [x] Slice 1e: Portal new-booking errors now say which fields failed validation instead of a generic message
- [x] Slice 2a: Calendar day/week/resource views render simultaneous bookings side-by-side instead of stacked
- [x] Slice 2b: Operations volume report at /admin/reports/operations — per day or month: daycare, in-house grooming, mobile grooming (with per-van breakdown), hotel check-ins/outs, transport; CSV export

## Deferred / not reproduced
- Portal new-booking failure: endpoint reachable, signed-in reproduction unavailable (external Supabase). Need Charlotte's exact error/service/account to go further.
- Printer failure: not reproduced — need browser/printer details.
- Adding items to an existing invoice: already possible (Invoice detail → add line; POS → attach to open invoice). Walk Charlotte through it.

## Next logical slices (proposed)
- [ ] Slice 3: Walk Charlotte's portal booking path end-to-end once we have her error details
- [ ] Slice 4: Dashboard "today" tiles — dogs in hotel, grooming today, vans out (surfacing existing counts on the admin dashboard)
- [ ] Slice 5: Invoice due-date rules per service (e.g. hotel deposit vs balance dates) if Charlotte wants more than service-date invoicing
