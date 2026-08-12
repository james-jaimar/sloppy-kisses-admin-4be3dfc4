# Branded quote PDF + a proper "before your stay" quote email

Two changes: make the quote PDF look exactly like the invoice, and move all the "what you need to know / bring" information out of the PDF and into a well-designed, editable email.

## 1. Quote PDF matches the invoice

Today the quote PDF is a plain one-off layout (no logo, no boxes, no branding) while the invoice PDF has the full branded treatment. The quote will be rebuilt on the same layout:

- Brand bar and tenant logo (with company-name fallback)
- "QUOTE" title and quote number on the right
- FROM / QUOTE FOR boxes (business details + VAT vs. customer name, number, address, email, mobile)
- Metadata strip: Quote #, Issued, Valid until (hold date), Status
- Same items table (Description / Qty / Unit / VAT% / Total) with brand-coloured header
- Totals block: Subtotal, VAT, Total, plus a 50% deposit-to-secure line and balance due before arrival
- Stay summary line (dates, accommodation type, arrival/collection windows, extras such as Stay & Play or grooming)
- Banking details box and notes/footer, same as the invoice
- Unicode-safe font (Noto Sans) so arrows, dashes and pasted characters can never crash the PDF again

To avoid two drifting layouts, the shared drawing helpers (fonts, wrapping, boxes, table, totals) move into a shared module used by both the invoice and the quote generator.

## 2. Quote email carries the accommodation information

The quote stays a quote; everything a first-time hotel customer needs goes in the email body:

- Greeting, quote number, stay dates, accommodation area, total, deposit terms and validity date
- Check-in / check-out: Mon-Sat 09:00-11:00 arrivals, no arrivals Sundays or public holidays; collections 09:00-09:30 daily, Stay & Play collection 16:00-16:30; closed 25 & 26 Dec and 1 Jan
- Before arrival: sterilised, fully vaccinated (Kennel Cough at least 10 days prior) and dewormed; vaccination card attached; dogs must be social; collar with name tag and contact number
- What to pack: food in individually labelled ziplock bags with name and breed, written feeding and medication instructions, no beds/bowls/pillows
- Good to know: 50% grooming discount when booked with the stay, daily photos on Facebook, emergencies communicated directly, hotel viewings Mon-Fri 10:00-13:00
- Accommodation areas explained (Cuddle Inn, Barkside Inn cabanas, Bark Avenue deluxe)
- Contact details footer

The email is HTML, branded in the tenant's colours, plus a plain-text fallback.

## 3. Admin control over the wording

Rather than hard-coding this text, it becomes an editable template:

- New `quote_sent` event code in Settings → Message templates, with quote variables (quote number, stay dates, total, deposit, valid-until, accommodation type, pet names, portal link)
- Seeded with the full default wording above, so it works out of the box and the owner can edit it later without a developer
- The hotel guidelines already stored per tenant (Settings → Hotel workflow) are appended automatically, so guideline edits flow straight into the email
- `send-quote-email` renders that template when present and falls back to the built-in default if it has been deleted

## Technical notes

- New `supabase/functions/_shared/pdf-brand.ts` with font loading, the `safe()` sanitiser, wrapping and layout primitives; `generate-quote-pdf` and `generate-invoice-pdf` both consume it.
- `generate-quote-pdf` gains reads of `invoicing_settings` (company name, VAT, banking, footer), `tenants.logo_url`, and `estimates.extras` for the stay summary.
- `send-quote-email` looks up `message_templates` for `quote_sent`/email, renders `{{...}}` tokens with the existing renderer, and appends `get_hotel_guidelines`.
- Migration: insert the default `quote_sent` template per tenant if absent; add `quote_sent` to the event-code list in `MessageTemplatesPage.tsx` and to `templateVariables.ts`.