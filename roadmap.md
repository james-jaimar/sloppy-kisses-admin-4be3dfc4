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
- [~] Slice 3: Walk Charlotte's portal booking path end-to-end — SKIPPED for now, waiting on her exact error details
- [x] Slice 4: Dashboard "today" tiles — hotel tile now shows dogs in house + check-ins/outs today; mobile tile shows vans out (verified: typecheck + 71 tests + build OK)
- [x] Slice 5: Per-service payment terms — new "Payment terms per service" section in Invoicing Settings; same-day/walk-in invoices use the service's own terms (verified against live DB: grooming 0d → due today, transport 30d → due +30; test data removed)

## Next logical slices (proposed, 26 Oct)
- [x] Slice 6: Staff pet-change prompt offers rescaled extras or keeps totals; walks use dog count (11 → 22 for a second dog, unchanged for a cat). Apply/keep decisions verified by component tests.
- [x] Slice 7: Mixed dog+cat booking/quote accommodation choices use species-compatible rates; public/portal extras use dog-only walks and Stay & Play. Live public price check: two dogs + cat, 11 nights, 22 walks. Rollback database regression verified separate stay rates, quote acceptance without invoice, and one invoice after confirmation. Full suite: 83 tests passed.
- [ ] Slices 6/7 authenticated smoke check: staff save/reopen and customer portal submission remain unverified because the connected external Supabase has no available managed test session.
- [ ] Slice 8: Printer failure + portal booking reproduction — both need Charlotte's exact error/browser details before they can be fixed

## Hotel follow-ups (26 Oct, afternoon)
- [x] Slice 9: Removing a pet from an already-invoiced hotel stay drafts a credit note for that pet's nights (rate, peak and discount aware); invoice untouched. Rollback DB test: 2 dogs + cat, remove cat → draft credit = 11 cat nights.
- [x] Slice 10: "Separate rooms" option on staff bookings and quotes — each pet charged the full nightly rate instead of the extra-pet rate; accepted quotes carry it into the booking. Rollback DB test verified shared vs separate totals.
- [x] Slice 11: Transport cards flag cats needing a secure carrier, and a lane banner warns when cats and dogs travel together. Checkout grooming was already per pet (each pet ticked on its own). 86 tests pass.
- [ ] Signed-in check of slices 9–11 (staff save, quote acceptance) — not available on this external database.

## Hotel extras access repair (30 Oct)
- [x] Repair staff surcharge permissions and add customer own-booking read access. Registered legacy edit permissions for the four staff roles; rollback DB test verified front-desk insert/update/delete, customer own-only reads, blocked customer mutations/anonymous reads, no premature invoice and no retained fixtures. 20 hotel extras tests passed; preview build OK.
- [x] Restore BK00326 Stay & Play from its saved checkout window: one dog, R250; booking remains draft with no invoice.
- [ ] BK00326 Walks: no intended quantity retained in saved booking/intake; Charlotte must confirm whether walks were selected and how many.
- [ ] Signed-in staff/portal screen save and reopen remains unverified: external unmanaged authentication has no available test session.
