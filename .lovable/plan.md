## Fix invoice PDF: Bill To and Banking Details

### Root cause (confirmed against DB)
The edge function `supabase/functions/generate-invoice-pdf/index.ts` selects columns that don't exist on `customers` (`phone`, `address_line1`, `address_line2`, `postal_code`, `vat_number`). PostgREST returns an error, `customer` is null, so BILL TO renders "—".

Actual columns on `customers`: `mobile`, `phone_alt`, `address_line_1`, `address_line_2`, `suburb`, `city`, `province`, `postcode`. No `vat_number` column exists.

Banking details render as one line because `drawWrapped` splits on any whitespace, collapsing user-entered line breaks from the settings textarea.

### Changes to `supabase/functions/generate-invoice-pdf/index.ts`

1. **Customer select** — fix column names:
   `id, full_name, customer_number, email, mobile, phone_alt, address_line_1, address_line_2, suburb, city, province, postcode`
   Remove `vat_number` reference.

2. **BILL TO block** — use the corrected fields:
   - Phone line uses `mobile` (fallback `phone_alt`).
   - Address line composed from `address_line_1, address_line_2, suburb, [city, postcode] joined, province`, filtered for empties.

3. **Banking details** — honor hard returns:
   - Add a `drawMultilineWrapped` helper (or split input on `/\r?\n/` and call `drawWrapped` per line, advancing y by one line-height between lines, including blank lines).
   - Use it for the banking details box and for the notes block (so notes also respect line breaks).

No client-side or schema changes. After edit, redeploy the function.

### Verification
- Reload the invoice `INV00096` PDF — BILL TO shows Mandy Bergront with address/contact populated; banking details render across multiple lines matching the settings textarea.