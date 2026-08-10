# Grooming add-ons: fix invoicing, add timings, allow standalone treatments

## What went wrong on BK00244

Confirmed by inspecting the booking, its invoice and the database triggers:

1. **The add-on row was never saved.** The trigger that copies a saved grooming add-on onto the invoice reads a field called `quantity`, but the add-ons table stores `qty`. Every insert into `grooming_booking_addons` therefore errors and rolls back — so the nail trim you ticked was silently lost. This affects portal grooming bookings too, which insert into the same table.
2. **The instruction-driven fallback was blocked.** "Nails: trim" also maps to the `nails_trim` add-on via the instruction catalogue, and a second routine adds those lines to the invoice. That routine only runs while the invoice is still a draft. Because grooming invoices are issued at booking time, the invoice was already `issued` (13:43:47) before the instructions were saved (13:43:48), so it bailed out.

Result: the invoice shows only the package line (R545 incl. VAT) and is missing the R130 nail trim.

## Fixes

### 1. Add-ons reach the invoice, every time
- Correct the add-on invoice trigger to read `qty`, and make it re-run on update/delete so edits to a booking keep the invoice in step.
- Allow the instruction-to-add-on sync to run on `issued` invoices too (still blocked once sent/part-paid/paid/cancelled, as today).
- De-duplicate: an add-on arriving both from a ticked extra and from an instruction option must produce a single invoice line.
- Backfill BK00244 (and any other grooming booking whose ticked/instructed add-ons are missing from its invoice) so balances are right.

### 2. Prices are VAT-inclusive
- Change the grooming booking form's price summary to label rate-card prices as VAT-inclusive and show the same total the invoice will show, so R675 on the booking equals R675 on the invoice.

### 3. Timings on add-ons
- Add a `duration_minutes` field to grooming add-ons (default 0).
- Settings → Grooming add-ons gets a **Minutes** column, editable inline and on the new-add-on row.
- Booking duration becomes package minutes + sum of selected add-on minutes (x qty). This feeds the slot picker, availability checks and the calendar block, so a groom with every extra reserves ~90 minutes.
- Show "Duration: 60 + 15 = 75 min" in the grooming extras panel so front desk sees the impact.

### 4. Standalone treatments
- Add a `bookable_standalone` flag to grooming add-ons. Treatments to enable: teeth (gel only), teeth + toothpaste, nail trim, ear cleaning, hand stripping, anal gland express.
- Price is the same as the add-on price; duration comes from the new minutes field.
- Settings → Grooming add-ons gets a **Bookable on its own** toggle per row.
- Admin booking form: grooming bookings can be created with **no package** — pick one or more standalone treatments instead. The package selector stops being mandatory when at least one standalone treatment is chosen; duration and price come from the treatments.
- Customer portal grooming wizard: a "Quick treatments" section listing standalone-enabled treatments with price and duration, bookable without a full groom.
- Invoicing: a treatment-only booking produces an invoice with the treatment lines (no package line), using the same issue-at-booking behaviour.

## Technical notes
- Migration: `ALTER TABLE public.grooming_addons ADD COLUMN duration_minutes int NOT NULL DEFAULT 0, ADD COLUMN bookable_standalone boolean NOT NULL DEFAULT false`; seed minutes/flags for the six treatments; rewrite `grooming_addons_auto_invoice` (qty fix + update/delete handling); relax the draft-only guard in `grooming_sync_instruction_addons` and add the dedupe check; one-off backfill for existing bookings.
- Front end: `groomingRateCardQueries.ts` (types + fields), `GroomingAddonsPage.tsx` (minutes + standalone columns), `GroomingExtrasPanel.tsx` (duration/VAT summary), `BookingFormModal.tsx` (package optional when standalone treatments chosen, duration maths), portal grooming wizard, `pricing.ts` duration helper.
- `grooming_details_auto_invoice` keeps handling the package line; standalone-only bookings insert a details row with a null package so the invoice is created, then add-on lines attach to it.