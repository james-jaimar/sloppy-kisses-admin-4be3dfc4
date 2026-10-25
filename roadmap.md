# Public booking refresh
# Hotel approvals and payment-first billing
- [x] Add secured hotel review/checklist and payment-first invoice rules; preserve existing issued invoices.
- [x] Add Hotel pipeline page, booking review, uploads, estimate/pro forma and verified payment actions.
- [x] Mirror review and payment-request status in the customer portal; add editable workflow settings.
- [x] Add total walk quantities, Cat Hotel labels, collection-time capture and existing trial-day shortcut.
- [x] Verify cutoff and payment-first accounting with rolled-back database test and 17 frontend tests; public form has no runtime errors or horizontal overflow.
- [ ] Verify signed-in staff and customer hotel review/upload/payment flow — blocked by external/unmanaged Supabase session access.
- [ ] Finish mixed dog/cat per-pet resource allocation and calendar/capacity checks; current prices use pet species but placement remains booking-wide. Awaiting completion, not verified.
- [ ] Verify booking photography on hosted preview; local browser did not render asset-pointer images.
# October price-list updates
- [x] Add missing grooming treatments using existing editable Settings catalogs; retain Full/Express inclusions.
- [x] Add Saturday daycare pricing and eligibility; enforce no weekend trials.
- [x] Implement five-day daycare monthly free-groom allowance.
- Birthday parties and party packs deferred by the owner; excluded from this update.
- [x] Verify pricing tests, public Full-groom estimate and rolled-back database assertions for weekday trials and monthly free-groom limits.
- [ ] Push new item codes to live Xero — blocked by an authorised connection.
- [ ] Verify signed-in staff/portal price-list booking end-to-end — blocked by external/unmanaged Supabase session access.

- [x] Find and inspect genuine Sloppy Kisses imagery.
- [x] Refresh /book and /book/hotel with photo-led presentation, accommodation choices and a clear price summary.
- [x] Keep the award explicitly unconfirmed and check accommodation selection, totals and gallery at desktop and phone widths (no test booking submitted).

# Unified hotel booking
- [x] Share hotel photographs, accommodation choices and stay summary with the customer portal.
- [x] Retain public hotel choices through sign-in and safely match saved pets.
- [x] Preserve portal care, consent, quote and booking workflows; carried extras now save as priced surcharge selections.
- [x] Test draft retention, tenant scoping, pet matching and public layouts.
- [ ] Verify signed-in portal booking end-to-end — blocked by external/unmanaged Supabase session access.

# Portal hotel extras
- [x] Restore interactive extras and per-pet quantities in the hotel portal summary.
- [x] Save selected extras with bookings and quotes using current configured prices; both endpoints deployed.
- [x] Verify pricing and persisted quantity rules (13 tests passed), public controls and mobile layout; authenticated portal save remains blocked as noted above.