# Fix: quote email fails with "Edge Function returned a non-2xx status code"

## What's actually happening

It is **not** the outbound email lock. The lock returns a clean "blocked" result (and writes a `[BLOCKED]` row to the email log), and your address is on the test allowlist anyway. There is no email-log row at all for QU-00001, so the function died before it ever reached the send step.

The failure is in the **quote PDF generator**, which runs before sending:

- The PDF writes the stay line as `Stay: 07 Sep 2026 → 12 Sep 2026`.
- The arrow character `→` is not part of the standard PDF font encoding (WinAnsi) used there, so the PDF library throws.
- That crash returns a 500, the email function turns it into a 502, and the browser shows the generic "Edge Function returned a non-2xx status code" toast.

Any quote with check-in/check-out dates hits this — which is every hotel quote. The "PDF" download button on the quote page uses the same generator, so it fails the same way.

## The fix

1. Replace the arrow with a safe separator (`to`) in the quote PDF.
2. Add a small text sanitiser used by every text draw in the quote PDF, so any smart quote, arrow, or emoji pasted into a description or notes field is downgraded to a safe equivalent instead of crashing the whole PDF.
3. Wrap the PDF build in error handling that returns a readable JSON error instead of an unhandled 500.
4. Pass the real reason through: the email function should include the PDF error text, and the quote page toast should show it rather than the generic edge-function message.
5. Log a failed row to the email log when a quote send fails before sending, so the Comms screen shows the attempt instead of nothing.

## Technical notes

- `supabase/functions/generate-quote-pdf/index.ts`: line 90 `→`; add `safe()` wrapper applied to all `drawText` calls; try/catch around the build returning `{ error }` with CORS headers.
- `supabase/functions/send-quote-email/index.ts`: surface `pdfRes` body text in the returned error and insert a `status: 'failed'` `email_log` row before returning 502.
- `src/features/quotes/queries.ts` (~line 210): read `FunctionsHttpError` context so the toast shows the server's message.
- Same arrow/encoding check applied to `generate-invoice-pdf` and `generate-credit-note-pdf` while in there, if they use the same characters.
- Verify by re-sending QU-00001 to your allowlisted address after deploy.
