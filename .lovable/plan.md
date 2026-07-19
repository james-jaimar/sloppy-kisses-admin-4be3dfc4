## Goal
Clean up duplicate customer emails, then give you tools to merge or delete the rest so this never happens again.

## Current state (verified against the live DB)
- 54 duplicate email groups involving 113 customer rows.
- 30 of those rows are completely empty: zero pets, zero bookings, zero invoices. These are safe to hard-delete.
- After that cleanup, ~32 duplicate groups (~65 rows) will remain — every remaining row has at least one pet attached, so we need your judgement (or a merge) before touching them.

## Step 1 — Safe automated cleanup (this turn)
Hard-delete every customer that:
- shares a lowercased email with another active customer in the same tenant, AND
- has 0 pets AND 0 bookings AND 0 invoices.

Expected impact: 30 rows deleted, 24 duplicate groups fully resolved.

I'll run it as a single transactional DELETE and report back the exact count.

## Step 2 — Report what's left
After the delete, I'll list the remaining duplicate groups so you can see:
- email, both/all customer numbers, name on each row, pet count, booking count, invoice count, last activity.

That's where we stop this turn and you decide how to handle them.

## Step 3 (next turn, after you approve the shape) — Merge tooling
For the remaining duplicates where both sides have real history, add a "Merge into…" action on the Customer detail duplicate banner:
- Pick which row is the survivor.
- Reassign pets, bookings, invoices, payments, credit notes, documents, notification_events, portal profile link from the loser → survivor.
- Archive the loser row (status = 'archived') so history and FKs stay intact.
- Gated by a new `customers.merge` permission.

## Step 4 — Prevent future duplicates
The DB trigger `customers_prevent_duplicate_email` already blocks new collisions. Once step 1 finishes and the remaining groups are down to a manageable number, we can additionally add a partial unique index on `(tenant_id, lower(email)) WHERE status <> 'archived'` as a belt-and-braces guarantee — but only after step 3 is done, otherwise the index creation will fail.

## Technical notes
- Step 1 SQL (runs via supabase--insert):
  ```sql
  WITH dup_emails AS (
    SELECT tenant_id, lower(email) AS em
    FROM public.customers
    WHERE email IS NOT NULL AND length(trim(email))>0 AND status::text <> 'archived'
    GROUP BY 1,2 HAVING count(*) > 1
  ),
  deletable AS (
    SELECT c.id
    FROM public.customers c
    JOIN dup_emails d ON d.tenant_id=c.tenant_id AND lower(c.email)=d.em
    WHERE c.status::text <> 'archived'
      AND NOT EXISTS (SELECT 1 FROM public.pets p WHERE p.customer_id=c.id)
      AND NOT EXISTS (SELECT 1 FROM public.bookings b WHERE b.customer_id=c.id)
      AND NOT EXISTS (SELECT 1 FROM public.invoices i WHERE i.customer_id=c.id)
  )
  DELETE FROM public.customers WHERE id IN (SELECT id FROM deletable);
  ```
- Related tables checked: `pets`, `bookings`, `invoices`. Other tables (`notification_events`, `documents`, etc.) are only relevant for the merge step and don't block deletion of truly-empty rows (they'll cascade or are nullable — I'll verify before running).
