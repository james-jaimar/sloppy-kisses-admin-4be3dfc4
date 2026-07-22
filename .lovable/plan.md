# Sprint 3 — In-house grooming to parity

Bring grooming (in-house + mobile) up to the same level as Hotel/Cattery: rate-card driven pricing, live preview, addon selection, vax gate on Confirm, and pensioner discount actually applied to the invoice.

## What already exists (verified)
- `grooming_packages` + `grooming_addons` tables + full Settings CRUD (`GroomingPackagesPage`, `GroomingAddonsPage`).
- Auto-invoice triggers on `grooming_booking_details` and `grooming_booking_addons` (migrations already in place).
- Grooming board with soft vax check on Check-in.
- Customer portal wizard already picks package + addons.

## What's still missing (parity gaps)
- Staff `BookingFormModal` grooming section is free-text: no package picker, no addon multi-select, no price preview.
- Vaccination gate on Confirm (like hotel) — currently only checked at Check-in.
- Pensioner discount is a boolean on the booking but never applied to the invoice line.
- Mobile travel fee is a free number instead of settings-driven.

## Deliverables

### 1. Rate-card driven grooming fields in `BookingFormModal`
Rewrite `GroomingFields` in `src/features/bookings/BookingDetailsFields.tsx`:
- Species/size aware package dropdown pulled from `grooming_packages` (active only, filtered by pet species + size band when known, otherwise show all with size in label).
- Multi-select chips for `grooming_addons` (active only), persisted to `grooming_booking_addons`.
- Duration auto-fills from `packages.expected_minutes` (still editable).
- Keep groomer name / notes / recurring / pensioner discount toggle.
- Mobile-only: travel fee remains editable but is prefilled from a new default in Grooming workflow settings.

### 2. Live price preview panel
New `GroomingPricePreviewPanel` (mirrors `HotelExtrasPanel` pattern):
- Shows package price, addons subtotal, travel fee (mobile), pensioner discount %, and total in ZAR.
- Pensioner discount % read from grooming workflow settings (new field, default 10%).

### 3. Persist grooming_booking_addons on save
Extend `saveDetails` in `BookingFormModal` to upsert/replace rows in `grooming_booking_addons` alongside `grooming_booking_details`, so the existing auto-invoice trigger materialises the addon lines.

### 4. Vaccination gate on Confirm
- Add `grooming_can_confirm_booking(booking_id)` RPC mirroring `hotel_can_confirm_booking` — reuses `vaccination_rules` for grooming service.
- Add `grooming_confirm_mode` (`off` | `warn` | `block`) to grooming workflow settings.
- New `GroomingVaxGatePanel` on booking detail page for in-house + mobile grooming bookings; behaviour identical to `HotelVaxGatePanel`.

### 5. Pensioner discount in auto-invoice
Update `grooming_details_auto_invoice` trigger:
- If `pensioner_discount = true`, apply configured % as a `discount` on the package line (using existing `invoice_items.discount` column from Slice 3).
- Trigger recalculates when the flag toggles.

### 6. Settings additions (settings-first rule)
Extend `GroomingWorkflowPage` (or add one if missing) with:
- `confirm_mode` for the vax gate.
- `pensioner_discount_pct` (default 10).
- `default_mobile_travel_fee_zar`.
Gated by `settings.grooming.manage`.

## Out of scope for this sprint
- Groomer resource assignment / capacity (belongs to a later "resources" sprint).
- Mobile van routing (already handled by MobileVansPage).
- Customer-facing portal wizard changes — already parity-compliant.

## Technical notes
- All new queries live in `src/features/grooming/queries.ts` and `src/features/settings/groomingRateCardQueries.ts` (extend, don't fork).
- New RPC + trigger changes go in a single migration; grants/policies follow the standard four-step template.
- Follow existing coral / semantic token styling — no hardcoded colors.
- Recurring grooming bookings continue to use the shared `recurring_rule_id` generator; no changes needed there.

Say **"go"** to start, or tell me which deliverable to drop / re-order.
