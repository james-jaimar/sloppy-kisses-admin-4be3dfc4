# Fix the Xero invoice push stalling out (browser shows a CORS error)

## What the evidence actually shows

- The sync log has **no failures at all today**: the 16:39–16:41 run pushed INV00223, INV00160…INV00174 plus a contact for each, all `success`. The 180 errors in the log are older (08:00–08:01, before the contact-ID fix) — 159 `PostDataInvalidException` (the bad contact GUID), 15 x `503`, 4 x `429`.
- The function logs show the worker `booted` at 16:40:58 and then only `shutdown` messages up to 16:42:13 — **no error, no result**. The invocation was killed mid-flight, so no response (and therefore no `Access-Control-Allow-Origin` header) ever reached the browser. That is exactly what "blocked by CORS policy / net::ERR_FAILED" means here: the request died, it is not a CORS misconfiguration (the function does set the headers).
- State right now: 196 of 238 eligible invoices are in Xero, queue empty, and only **185 of 4,086 customers carry a real Xero contact id**.

So: pushing works, but each invocation does far too much work and one killed invocation aborts the whole client loop.

Why an invocation dies: for every invoice we still have to resolve the contact (up to three `Contacts` searches, then a create) because almost no customer is linked. That is roughly 5 Xero calls per invoice, ~25 per chunk of 5, plus 1.1s pacing between each. Any `429`/`503` from Xero adds up to three retries with waits up to 15s each — the invocation blows past the runtime limit and is terminated silently. Xero's 60-calls-per-minute ceiling makes 429s near-certain once chunks run back to back, which matches "worked initially, then wouldn't push any more".

## The fix

**1. Make each invocation small enough that it cannot be killed.**
- Push **one** entity per HTTP invocation instead of five, and return as soon as it is done.
- Put an overall time budget in the handler: stop and return what has been done so far when the invocation approaches ~60s, rather than starting another Xero round-trip.
- Cap the Xero retry backoff so a single transient error can never consume the whole invocation (shorter waits, max total wait per call), and let the caller retry instead.

**2. Make the client loop resilient instead of all-or-nothing.**
- A failed chunk no longer aborts the backfill: retry that chunk up to 3 times with a pause, then record it as failed and carry on with the rest.
- Treat a dead invocation (`Failed to fetch` / `ERR_FAILED` / non-2xx with no body) as a retryable error, not a fatal one, and say so plainly in the progress line.
- Show live progress: pushed / failed / remaining, and a "Retry failed" button when the run finishes with failures.
- Small pause between chunks so we stay under Xero's per-minute limit.

**3. Stop paying the contact-resolution cost on every invoice.**
- Cache resolved contact ids in memory for the invocation and, more importantly, write the resolved id back onto the customer (already done) so a re-run skips the searches.
- Add a "link contacts first" nudge on the push panel when most customers are unlinked, pointing at the existing Xero customers matching screen — matching 4,086 customers in bulk there is one paged pull instead of thousands of one-off searches during invoice pushes.

**4. Prefer the queue for bulk work.**
- "Push invoices" enqueues the outstanding invoices and drains the queue in short calls, so a killed invocation loses nothing: the row stays `pending` and is picked up on the next pass. Progress and failures are visible in the existing queue/sync-log panels.

## Verification
Re-run the push for the 42 remaining invoices, confirm the run completes without the browser error, then report final pushed/failed counts with the exact Xero message for anything that failed.

## Technical notes
- `supabase/functions/xero-sync/index.ts`: chunk size 5 → 1 for `push`, add a deadline check in the `push`/`run_queue` loops, in-memory contact cache, enqueue-and-drain path for bulk backfill.
- `supabase/functions/_shared/xero.ts`: bound the retry budget (cap `Retry-After` honouring at ~10s, max 2 retries) so one call can't eat the invocation.
- `src/features/xero/XeroSettingsPage.tsx` / `queries.ts`: per-chunk retry with backoff, non-fatal failure handling, progress + "Retry failed", inter-chunk pacing, unlinked-customers hint.
- No database migration required.
