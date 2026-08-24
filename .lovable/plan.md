# Fix: till sale fails with "customer_number violates not-null constraint"

## What's happening

Confirmed cause: the walk-in customer the till creates for anonymous cash sales is inserted without a customer number.

- `customers.customer_number` is `NOT NULL` with no default and no trigger that fills it (verified against the database).
- Every other place that creates a customer first calls the `next_customer_number` database function to get the next number.
- `useEnsureWalkInCustomer` in the till code inserts `{ tenant_id, full_name: "Walk-in customer", notify_email: false }` only — so the insert is rejected, the walk-in customer is never created, and "Complete sale" fails at the tender step.

This only bites when no real customer is attached to the sale, which is the normal case at the till.

## The fix

1. In the till's walk-in helper, fetch a number via `next_customer_number` for the tenant and include it on the insert, matching how customers are created everywhere else.
2. Surface the real error text on the tender screen instead of a bare toast, so a future failure names itself.
3. Create the one walk-in customer for the live tenant (if it doesn't exist yet) and store it on retail settings, so the first sale doesn't have to create it.

## Verify

Run a cash sale through the till with no customer attached: the tender screen should complete, produce a paid invoice against "Walk-in customer", and deduct stock. Then confirm a second sale reuses the same walk-in record rather than creating another.

## Technical notes

- `src/features/pos/queries.ts` → `useEnsureWalkInCustomer`: add `supabase.rpc("next_customer_number", { target_tenant_id: tenantId })` before the insert and pass `customer_number`.
- No schema change needed; `next_customer_number(uuid)` is already granted to `authenticated`.
- No change to the sale, invoice, payment or stock pipeline.
