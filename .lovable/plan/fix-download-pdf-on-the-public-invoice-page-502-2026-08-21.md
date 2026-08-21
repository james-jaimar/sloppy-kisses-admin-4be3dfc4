# Fix "Download PDF" on the public invoice page (502)

Public link security: no changes — the tokenised hosted-invoice link stays as-is.

## What the console error is

`generate-invoice-public-pdf` returns 502. That status is only produced in one place: the wrapper resolves the token, then calls `generate-invoice-pdf` internally and returns `502` with the inner error whenever that inner call is not OK.

## Likely cause (to confirm first, not assumed)

`generate-invoice-pdf` requires a real end-user session: it calls `caller.auth.getUser()` and returns 401 "Not authenticated" when there is none. The public wrapper calls it with `Authorization: Bearer <service role key>`, which is not a user token, so `getUser()` returns no user. That would produce exactly the 502 seen.

It is not RLS. Two things must be confirmed before the fix:
1. Capture the inner error text the wrapper returns (currently swallowed into the 502 body) to prove it is the 401 and not, say, the font fetch failing.
2. `generate-invoice-pdf` shows no invocation logs at all, which needs checking — if it is not deployed, the inner call fails for a different reason and the fix differs.

Note the same service-token pattern is used by `send-invoice-email` for cron reminders, so if this is the cause, reminder emails are silently failing to attach a PDF too.

## Fix

1. Add a system/service path to `generate-invoice-pdf`: when the incoming Authorization bearer is the service role key, skip `getUser()` and read the invoice with the admin client instead of the caller client. Keep the existing user path (RLS-checked read) untouched for admin and portal downloads.
2. Surface the real inner error: log it and return a readable message rather than an opaque 502.
3. Re-check the public wrapper: it already validates the token and blocks drafts, so possession of the token remains the only authorisation — no widening of access.
4. Verify end to end: open a real `/i/<token>` link signed out, click Download PDF, confirm a PDF downloads and the console is clean; then confirm the admin invoice page download and an invoice email attachment still work.

## Technical notes
- Files: `supabase/functions/generate-invoice-pdf/index.ts` (service-token branch + error logging), `supabase/functions/generate-invoice-public-pdf/index.ts` (error passthrough). No database or RLS changes.
