# Grooming instructions — end-to-end wiring

Catalog, per-pet defaults, per-booking overrides, and priced add-ons already exist. This plan closes the loop so a customer can set defaults, request a groom, and have those instructions flow through admin booking edits into the invoice line items and the printed invoice.

## 1. Customer portal — pet defaults

- Add a "Grooming defaults" card to `MyPetDetailPage.tsx`, reusing `PetGroomingDefaultsPanel` (already used on admin pet detail).
- Read-only fallback if the pet is not a dog / cat.
- Uses existing `pet_grooming_defaults` table + RLS (customer owns the pet).

## 2. Customer portal — grooming request wizard

Update `GroomingRequestWizard.tsx` (in-house + mobile):

- Load the pet's saved defaults once a pet is chosen and show them as a prefilled `GroomingInstructionsForm` (compact mode), so the customer sees exactly what will be done.
- Let them tweak selections for this visit and add a "notes for this appointment" free text.
- Drop the current ad-hoc "Add-ons pills" list — add-ons are now driven by the instruction catalog's `addon_code` mapping (single source of truth), matching admin behaviour.
- Persist into `booking_requests.request_payload.instructions = { selections, medical_flags, notes, told_office_to_call }` alongside `package_id`.
- Show a live price preview (package + auto add-ons + puppy discount hint) using `computeGroomingPrice`.

## 3. Convert request → booking

Update `src/features/bookingRequests/convert.ts`:

- Carry `payload.instructions` into a new optional `grooming_instructions` field on `ConvertPrefill`.
- Update `BookingFormModal` to seed `groomingInstructions` state from the prefill when converting (instead of only from pet defaults), so the customer's requested tweaks land in the admin form.

## 4. Admin booking edit surface

Already wired in `BookingFormModal` (form + persistInstructions). Add read-only summary on `BookingDetailPanel` / `BookingDetailPage` for grooming bookings:

- "Grooming instructions" card showing selected options grouped by category, medical flags (red chips for `is_alert`), notes, and "told office to call".
- Uses `useBookingInstructions(bookingId)` + `useInstructionCatalog(tenantId)` to render labels.

## 5. Invoice line items — reflect what was chosen

Migration on `grooming_details_auto_invoice()`:

- After inserting the package line and surcharges, insert one `invoice_items` row per selected instruction option that maps to an active `grooming_addons.code` (looked up via `grooming_instruction_options.addon_code` + selections stored on `grooming_booking_instructions`).
- Deduplicate by `addon_code` (a customer picking both "Toothbrush provided" and "Toothpaste upgrade" that share a code counts once).
- Description format: `"<Add-on name> (<pet name>)"`, unit_price from the add-on, quantity 1.
- Idempotent: skip if a line with the same `booking_id` + description already exists on the invoice (so re-saving instructions doesn't duplicate).
- Also fire on `grooming_booking_instructions` insert/update so post-hoc instruction edits update the draft invoice; only touches invoices still in `draft` status.

Function stays SECURITY DEFINER with pinned search_path.

## 6. Invoice PDF & detail view

`src/features/invoices/pdf.ts` + `InvoiceDetailPage.tsx` already render `invoice_items.description` + amounts, so no template change needed. Verify by generating the PDF for a converted request-driven grooming booking.

## 7. Verification checklist

- Portal: set defaults on a pet → submit grooming request → payload carries instructions + package.
- Admin: convert request → booking form shows correct pet, package, instructions preselected, price preview matches.
- Save booking → `grooming_booking_instructions` row written, draft invoice has package + auto add-ons + surcharges.
- Edit instructions on existing booking → invoice updates without duplicate lines.
- Booking detail page shows read-only instruction summary with alert chips.

## Technical notes

- No new tables. Add nothing to `bookings`; extend `ConvertPrefill` and the DB trigger only.
- Portal RLS on `pet_grooming_defaults` already scopes by pet ownership.
- Keep `told_office_to_call` admin-only (hidden in portal form).
- All new code follows existing patterns (`sk-card`, semantic tokens, TanStack Query hooks in `features/grooming/instructions/queries.ts`).
