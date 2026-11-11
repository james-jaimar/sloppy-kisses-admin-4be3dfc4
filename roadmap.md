# Roadmap — Charlotte's grooming snags (25 Oct 2026)

## POS full bill and Yoco preparation (11 Nov)
- [x] Full itemised bill before payment and after sale, including existing invoice lines, VAT, discounts and prior payments.
- [x] Automatic paid PDF receipt through existing notifications; existing dispatcher deployed, email preferences respected, repeat sends prevented, settings toggle permission-checked.
- [x] Yoco setup preparation with counter/model/device fields and existing Yoco accounting mapping labelled correctly; no assumed API-key authentication or terminal compatibility.
- [x] Four frontend tests and rollback receipt tests passed (partial/full payment, opt-out, duplicate protection, disabled setting); no fixtures retained, preview build OK.
- [ ] Live signed-in checkout, email delivery and printing: external unmanaged sign-in unavailable; browser redirects to login without runtime errors.
- [ ] Yoco terminal activation: awaiting Charlotte’s model, Yoco Web POS authorisation/credentials and terminal test; ordinary online secret key is not confirmed sufficient.

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

## Front desk walkthrough (1 Nov) — see mem://features/front-desk-phases
- [x] Phase 1: customer/pet booking shortcuts + pet upcoming visits; boards open booking side panel; quick "Add extra" on grooming panel
- [x] Phase 2: reschedule slot finder, shift notes on diary cards, quick grooming walk-in (1 Nov)
- [x] Phase 3: daily front-desk handover at /admin/handover (arrivals, hotel departures, unpaid invoices, notes, pending requests)

## Charlotte's November updates (4 Nov) — execute sequentially
- [x] Slice 1: document deletion, per-visit travel pricing, hotel grooming quote pricing/package handoff, pet/stop counts. 13 focused tests and rollback travel check passed; confirmation reprices accommodation only. Signed-in checks unavailable on external Supabase.
- [x] Slice 2: mobile address save/select repair; Mon–Sat register including enrolments/swaps, Stay & Play, trials and unscheduled attendance; clearer walk-in label. Three weekly rule tests passed; signed-in print/save checks unavailable.
- [x] Slice 3: stocktake print and previewed new-product CSV import with opening receive movements. Five validation tests and authenticated-role rollback DB checks passed (audit, duplicate rejection, atomic rollback, signed-out block); no fixtures retained.
- [ ] Final signed-in walkthrough and physical printer check for all three slices: unavailable on external unmanaged Supabase; Charlotte's printer/browser details still required.

## Next front-office workflow improvements — options A and B (planning, 4 Nov)
- [ ] Slice 1 — release settings and scheduled drafts implemented; date tests and rollback lifecycle checks passed. Final payment-deadline regression, delivery check and signed-in save/reopen still pending; external unmanaged authentication blocks the signed-in check.
- [ ] Slice 2 — inline address and existing-pet corrections without losing the booking; reuse existing add controls.
- [ ] Slice 3 — optional named groomer preference alongside anonymous stations and verified PIN attribution.
- [ ] Slice 4 — faster unscheduled daycare check-in using the existing walk-in flow, preserving health/capacity/billing safeguards.
- Delivery gate: approve the plan, then complete and verify each slice before starting the next; name any unavailable live checks explicitly.

## Guided hotel intake (10 Nov)
- [x] Actionable outstanding items open the relevant pet/requirement; contrasting single-pet tabs and collapsed optional photos preserve shared controls.
- [x] Visible save state, serialized intake auto-save with failed-save retry, and a persistent staff confirmation action retain existing gates and waiver permissions.
- [x] Focused intake/vaccination/readiness regressions: 15 passed; preview build OK and signed-out browser had no runtime errors.
- [ ] Live authenticated save/upload/confirmation and desktop/mobile workspace visual checks: blocked by external unmanaged authentication; preview redirects to login.

## Hotel list view (10 Nov)
- [x] Grid/List toggle on Dog & Cat Hotel; monthly arrivals register with ribbon/card/gift/notes prep
- [ ] Signed-in visual check (external sign-in unavailable)

## Hotel Today register (11 Nov)
- [x] Today/Month switch, combined arrivals/departures, movement filters and isolated A4 landscape day sheet; grid-only date controls hidden in List.
- [x] Seven tests passed, including Johannesburg day boundaries, earlier-month departures, same-day movements and Today filter interaction; preview build OK.
- [ ] Live signed-in list/printing and desktop/mobile visual checks: external unmanaged Supabase redirects to login; no available authenticated session.
