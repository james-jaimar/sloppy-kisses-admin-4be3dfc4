# Roadmap — Charlotte's grooming snags (25 Oct 2026)

## Cancellation VAT correction (24 Nov 2026)
- [x] Corrected cancellation quotes, issued credits and remaining draft totals to include VAT without changing cancellation policies.
- [x] Five rollback-only scenarios passed for full/partial credits, retained fees, retries and shared draft invoices; 11 related display/state tests passed and preview build OK.
- [x] Reconciled unsynced CN-00052 to R545 with its original R473.91 application retained and a R71.09 correction application; invoice unchanged, cash paid R0, balance R0, audit entry recorded and document locks restored.
- [x] Opened the real public INV-70007 page: R545 total and R0 balance read back without runtime errors. No regression fixtures retained.
- [ ] Xero contact validation error: the existing customer ContactID is rejected by Xero; this separate contact reconciliation issue remains outside the VAT correction.

## Master daycare register import (23 Nov 2026)
- [x] Revalidated all 150 source rows: Zoey appears twice, yielding 149 dogs across 109 accounts; source breeds resolve Kelly/Mila duplicate profiles without merging them.
- [x] Added two customers and nine pets; imported 149 active enrolments and 240 expected visits for 23–27 November (47/45/55/41/52). Private batch evidence retains source rows and mappings.
- [x] Transaction assertions confirmed unchanged invoices, quotes, payments, messages, Xero queues/settings; normal pro-rata billing restored and payment sync remains off.
- [x] All 17 saved-data regressions passed; service-only evidence access verified and preview build OK.
- [ ] Signed-in daycare screen/printed worksheet walkthrough: external unmanaged authentication has no staff session; browser reached login without runtime errors.
- [ ] Capacity review: Wednesday 55 and Friday 52 exceed the configured 50; owner/staff must decide capacity, which was not changed by the import.
- [ ] Ocean/Knox weekdays and Tugg breed: staff/customer confirmation required; provisional schedule and existing breed retained with explicit notes.
- [ ] Three transport and two repeat grooming requests: captured as approved notes, awaiting staff route/time and appointment confirmation; no extra bookings or charges invented.

## Imported hotel transport (22 Nov 2026)
- [x] Added ten legs across six stays with twenty pet-trip links and Terence's vehicle; nine future trips remain requested for staff route/time review, and Nicolette's past pickup is completed.
- [x] Applied James's address answers: Adrian has no address yet (retained pending); Blu uses the saved home address for both trips.
- [x] Live SQL regressions passed for dates, vehicle/pet/address links, pickup-only stays, grooming-before-return, before-13:00 return and rollback-only hotel resaves; invoices/lines/payments/quotes/messages/Xero queues unchanged and payment sync remains off.
- [ ] Adrian's pickup address: customer/staff must supply it before dispatch; no address was invented.
- [ ] Signed-in transport board walkthrough: external unmanaged authentication has no available staff session.

## Imported hotel grooming and Stay & Play (22 Nov 2026)
- [x] Added eight dog-only Stay & Play sessions across the five missing late-collection stays, with no added fees.
- [x] Added 80 provisional station appointments from 79 requests across imported stays; retained Tia's 5 Dec/5 Jan repeats and all notes, avoided Sundays/closures/overlaps.
- [x] Transaction assertions verified unchanged invoices, invoice lines, quotes, payments, notifications and Xero queue; restored normal grooming billing and retained payment sync off.
- [x] Live saved-data regressions passed, including quoted-groom invoice guard calls without new invoices; preview build OK.
- [ ] Chance: requested groom was 21 Nov and the stay ends 22 Nov; retained pending for staff to confirm whether it already happened rather than inventing a past appointment.
- [ ] Signed-in board/daycare walkthrough: external unmanaged sign-in has no available staff session; saved-data checks are available, live staff-screen checks are not.

## Hotel desk usability (22 Nov 2026)
- [x] Added overlapping-stay periods, movement/species/grooming/balance filters and chronological/client/pet sorting; retained isolated prep writes and filtered printing.
- [x] Brought today's overview above occupancy and placed arrivals/departures alongside the grid at desk widths, independent of the grid's selected dates.
- [x] All 32 register/date/filter/payment regressions passed; preview build OK. No booking or billing records changed.
- [ ] Signed-in desktop/mobile visual and filtered-print walkthrough: external unmanaged sign-in has no available staff browser session; browser checks reached the sign-in gate without runtime errors.

## Hotel spreadsheet go-live import (22 Nov 2026)
- [x] Archived 184 original spreadsheet rows and full original records privately across 123 stays; cleaned 117 quotes and 67 invoices, retained care/review notes. Eight live data/access checks and four import tests passed; dates, billing, payments and queues unchanged. Staff-screen checks remain unavailable under external unmanaged sign-in.
- [x] Added Kitler's stay to separate company SK05083, matching Xero's existing number with five-digit padding; shared email retained as a company contact, not a second portal login.
- [x] Added Rebecca's Charlie stay to SK00495; James confirmed Rebecca Jordan and Rebecca Jordaan are the same customer.
- [x] James confirmed keeping Caryn Bell (5–6 Dec), Wilma Bodemer, Jamie Bishop (26–30 Nov) and Jan Beutes (23–28 Dec); Xero settled these invoices using earlier overpayments, not cancellation credits.
- [x] Matched the 125 current/future spreadsheet stays; imported 123 with 181 pet links, 67 existing Xero invoices and 117 original quotes. Historical stays excluded; two accounting exceptions held.
- [x] Preserved R511,024.22 invoice value, R445,228.47 settled and R65,795.75 outstanding; no new Xero invoices/payments or customer messages. Retained 70001 as the next invoice, payment sync off and restored automatic billing/push settings.
- [x] Read back every imported identity, date, pet and financial link; 15 frontend tests, three payment-policy tests and rollback-only quote/duplicate-groom billing checks passed. Temporary import endpoint and service-only RPC removed; build OK.
- [ ] Emile Govender/Loki, QU-4808 / INV-68436: R660 of CN-67162 is allocated to this stay, from a R3,300 historical credit note. Held pending a verified credit-note carry-over approach that preserves the remaining allocation history rather than recording a credit as cash.
- [ ] Sandra Naidoo/Scottie, QU-4870 / INV-68464: Xero invoice is still R0 against a R645 spreadsheet quote. Held pending bookkeeper confirmation of the intended bill; no duplicate invoice issued.
- [ ] Company primary-email/portal access: James confirmed the shared Landy email; it is stored in customer_contacts, while the company primary email remains unset because existing account email uniqueness must not be bypassed. Shared-login access needs a separately agreed approach.
- [ ] Signed-in hotel list, quote confirmation and collection walkthrough: external unmanaged Supabase has no available staff browser session; saved-data and rollback checks were verified, not a live staff-screen flow.

## Xero customer SK reconciliation (22 Nov 2026)
- [x] Phase 1: read 79 creation histories and 4,686 numbered Xero contacts against 4,376 app customers; exclude 41 supplier/expense contacts, three older contacts, and hold numbered duplicates and two uncertain name matches.
- [x] Phase 2: created and verified 66 unmatched customers, SK05084–SK05149, using the tenant allocator lock and retaining Xero IDs, source names and original creation dates; existing accounts untouched.
- [x] Phase 3: updated 66 existing Xero contacts in controlled batches and verified all SK05084–SK05149 numbers by fresh API readback; recorded successes and review/exclusion notes in Xero sync history. Four numbering/date/phone tests passed; preview build OK.
- [x] Laura/Louwra confirmed same customer: verified SK00958 already belongs to her account in both systems; no second account or number allocated.
- [ ] Resolve ten duplicate/conflicting Xero contacts: Chanelle, Susan, Clint, Nick, Andrew, Steven Kernick/Leanne, Laura, Tarryn, Mavis and Vanishkah. Blocked on identity/account ownership review and Xero duplicate merge decisions; existing numbers and links left untouched. Mavis is SK04576 in app versus SK04977 in Xero.
- [x] Trisha Govender confirmed different from Nerisha: created SK05149 and verified Xero readback; Nerisha SK01334 unchanged, initial review note retained and marked resolved.

## Xero open-invoice reconciliation (18 Nov 2026)
- [x] Add permission-gated payment-sync setting, off by default, without changing invoice/customer/item sync or app balances.
- [x] Block automatic and manual payment pushes; retire ten failed payment queue entries with original errors and skipped logs preserved; two already-synced payments untouched.
- [x] Verify persisted setting/queue state, six payment-policy tests, deploy worker and check preview build OK.
- [ ] Live staff settings save/reopen and Xero reconciliation readback: external unmanaged sign-in unavailable; no live Xero payment or invoice was created for testing.

## Faster front-desk collections and payments (18 Nov 2026)
- [x] Plan all three improvements together, including shared invoice resolution, payment states, permissions and cross-screen refresh.
- [x] Slice 1 implementation: shared direct/item invoice resolution, booking summary and prefilled payment above the panel; partial-payment, permissions, shared/draft/no-invoice tests passed.
- [x] Slice 2 implementation: customer/pet-name visit search, booking side-panel search links, customer outstanding total/credit and preselected payment shortcut.
- [x] Slice 3 implementation: Ready cards show paid/outstanding/shared-invoice states, with daycare return kept separate; batched shared reads and payment refresh reused.
- [x] Focused automated verification: 27 tests passed; preview build OK; signed-out browser reached login with no runtime errors.
- [ ] Real staff payment/readback and desktop/mobile collection walkthrough for all three slices: blocked by external unmanaged authentication; no signed-in session is available. No live payment or authenticated visual result is claimed. Automatic Yoco charging remains separate.


## Yoco payments — staged integration (18 Nov 2026)
- [x] Investigate existing invoice/POS/settings flows and current official Yoco Web POS documentation; prepare the staged plan.
- [ ] Slice 1: payment-method buttons across invoices and POS; preserve manual methods and distinguish manual Yoco from connected Yoco.
- [ ] Slice 2: permission-gated Yoco test setup, safe credential handling, connection checks and counter registration; Web POS requires OAuth access, not Checkout keys alone.
- [ ] Slice 3: durable payment attempts, server-verified results, atomic allocations and duplicate-safe recovery; isolate test payments from live balances, stock, receipts and Xero.
- [ ] Slice 4: invoice/front-desk Yoco payment flow with progress, partial payments and recovery.
- [ ] Slice 5: POS Yoco flow, including split payments and existing invoice plus retail; recover confirmed card payments without duplicate sales or stock movements.
- [ ] Slice 6: sandbox checks, real compatible-terminal check, receipts/Xero mapping and explicit live activation. Credentials, OAuth approval, exact Khumo variant and physical testing remain external dependencies.

## AWS Amplify preparation (13 Nov)
- [x] Bundle the four existing public/login images so Amplify does not need Lovable's asset proxy; original CDN objects retained for older deployments.
- [x] Add lockfile-matched Amplify build settings and a domain cutover checklist, including APP_BASE_URL and SPA rewrite configuration.
- [x] Verify local image rendering with Lovable proxy blocked on login/signup/public hotel pages; 130 tests passed and preview build OK. Hosting preparation committed.
- [ ] Live Amplify deployment and domain cutover: awaiting James's AWS/DNS configuration; existing Supabase remains in place.

## Hotel quote-first enquiry flow (11 Nov)
- [x] Generate a quote after a quick enquiry saves; expose email, public WhatsApp link and phone acceptance before intake, with a post-save Send quote shortcut.
- [x] Keep intake and confirmation after acceptance; retain accepted quote and needs_info when notes save, no invoice until staff confirmation. Public acceptance button environment access corrected after browser reproduction.
- [x] Focused frontend regressions and rollback hotel lifecycle checks passed; public acceptance screen exercised with test responses on desktop/mobile without login or runtime errors.
- [ ] Live staff save/send and real email/WhatsApp acceptance: external unmanaged authentication has no available staff session; public browser check used test responses, not a real customer's quote.

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
