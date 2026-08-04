# Why the Xero push struggled — and what to do about it

## What the code actually does

Your mental model is right, and it is what the code does. Pushing one invoice:

```text
invoice -> customer.xero_customer_id set? -> yes: use it (0 extra Xero calls)
                                          -> no : search Contacts by account number
                                                  search Contacts by email
                                                  search Contacts by name
                                                  create/update the contact
```

It never scans 4,086 customers per invoice. The "4,086 customers" figure you saw is the
backfill counter on the Xero settings screen — how many customers have no Xero contact id
yet. Right now that is 3,866 unlinked, with only 220 linked.

## So why did it fall over?

Because almost none of your customers were linked, nearly every invoice took the slow branch:
up to 3 Xero searches plus 1 create, each paced ~1.1s to stay under Xero's 60-calls-per-minute
limit. Batch several invoices into one HTTP call and the edge invocation ran past its wall-clock
limit and was killed with no response — which the browser reports as a CORS / `net::ERR_FAILED`
error. CORS was never actually the problem, and nothing "changed": you simply moved from
invoices whose customers happened to be linked to invoices whose customers were not.

Xero's rate limit compounded it — once chunks ran back to back, 429s appeared, each adding
retry waits, pushing invocations over the limit sooner.

## Current state (verified just now)

- 236 invoices in Xero, **4 left** to push.
- The most recent run logged 55 invoice creates and 50 contact creates, **zero errors**.
- So the smaller-chunk + time-budget change already deployed has the push working.

## What to do so this never bites in production

**1. Link the contact base once, up front (the real fix).**
Use Settings → Xero customers: pull all Xero contacts (paged, cheap), auto-match them to your
customers by account number / email / name, then confirm the links. That writes
`xero_customer_id` onto each customer in bulk. After that every invoice push is a single Xero
call, exactly as you expect, and a brand-new customer is the only case costing extra calls
(one create).

**2. Make the unlinked state visible instead of silent.**
On the Xero settings page, show "3,866 of 4,086 customers not yet linked" as a warning with a
direct link to the matching screen, stating plainly that invoice pushes stay slow until it is done.

**3. Push on issue, not in bulk batches.**
Once contacts are linked, an invoice going to Xero at the moment it is issued (via the existing
sync queue) is a one-call job — no big backfill runs, no rate-limit pressure. Bulk push then
exists only for historic catch-up.

**4. Keep the safety rails now in place.**
Small chunks, a wall-clock budget so an invocation always returns, capped retries, and a
per-invocation contact cache — these stop a slow run turning into a silent dead request.

## Technical notes

- Contact resolution: `supabase/functions/xero-sync/index.ts` → `ensureContact` / `findContact` / `pushCustomer`.
- Bulk matching already exists: `pull_contacts`, `match_contacts`, `link_contacts` actions plus
  `src/features/xero/XeroCustomersPage.tsx`. Step 1 needs no new backend work — it is a process
  step plus the UI warning in step 2.
- Step 3 uses the existing `xero_sync_queue` and `run_queue` action; the change is enqueueing on
  invoice issue rather than relying on the manual push button.
- No database migration required.