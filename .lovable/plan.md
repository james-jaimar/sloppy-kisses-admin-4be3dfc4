## Why you're only seeing 40 (and can't find Mike Rees)

The "Choose existing customer" modal isn't really searching your database — it's filtering a small in-memory list, and it's then capping that list at 40. Two separate bugs stacked on top of each other:

1. **In-memory list, not a live query.** The picker uses `useTenantPetsWithOwners`, which does a single `SELECT` from `pets` with no search filter. Supabase's PostgREST caps unbounded selects at **1,000 rows** by default, so on a 4,000-customer tenant we only ever see the first ~1,000 pets (alphabetical by pet name). Any customer whose pets sort after that cutoff is invisible — and any customer with **no pet yet** (likely Mike Rees's situation, since he shows up on the Customers page but not here) can never appear at all, because we're searching pets, not customers.
2. **Hard-coded `.slice(0, 40)`** in `CustomerDatabaseSearchModal` truncates the grouped results to 40 customers. That's the "40" you're seeing in the counter.

## Plan

All changes stay inside `src/features/settings/DaycareImportPage.tsx` (plus one small helper in `src/features/customers/queries.ts`). No schema, no RLS, no commit-logic changes.

### 1. Replace the in-memory picker with a live server-side search

- Introduce `useCustomerPetSearch(tenantId, q)` in `src/features/customers/queries.ts`:
  - Debounced query (300 ms) enabled only when `q.trim().length >= 2`.
  - Uses the same tokenised `.or(...)` pattern already in `useCustomers` (splits on whitespace, ANDs each token) matching on `full_name`, `first_name`, `last_name`, `mobile`, `phone_alt`, `customer_number`.
  - Selects `id, full_name, first_name, last_name, mobile, phone_alt, pets(id, name, species)` so we can render owner + pets in one shot.
  - `.limit(50)` on customers (plenty for a name/mobile search; also cheap).
- `CustomerDatabaseSearchModal` calls this hook instead of filtering `pets` in JS. Loading spinner while the query runs, "type at least 2 characters" hint before that, "no matches" when the query returns empty.
- **Delete the `.slice(0, 40)`** — the server-side `.limit(50)` is the only cap, and the counter shows "N customers" honestly.

### 2. Let you pick a customer even if they have no pet yet

Right now the picker only shows pets, so a match like Mike Rees (customer exists, no `pets` row) is unreachable. New behaviour:

- Every result row shows the customer with a **"Link to this customer"** button in addition to any existing pet chips.
- Clicking a pet chip: same as today — sets both `matched_pet_id` and `matched_customer_id`, row → **confirmed**.
- Clicking **Link to this customer**: sets `matched_customer_id` only, leaves `matched_pet_id` null, row → **confirmed**. The commit step will then create a pet for this seed row under that customer (it already handles the "new pet, existing customer" case for the *Create new* button — we reuse the same code path).

### 3. Small UI cleanups in the modal

- Show the customer's `customer_number` next to their name so you can eyeball the right person quickly (matches the format on the Customers page, e.g. `SK00649`).
- Header counter reads "Showing top 50 matches — refine your search" when the query returns exactly 50 rows, so it's clear when results are being capped.
- Everything else (Escape, Cancel button, no-backdrop-close) stays as-is.

### 4. Not touched

- The auto-match scoring (`scoreRow`) — that lives on the pre-loaded pet list and is only used to seed the initial Auto/Review buckets; the picker fix is orthogonal.
- The seed file, commit step (enrolments, attendance, invoices), or any DB objects.

## Result

After this change the "Choose existing customer" modal will actually hit the database, return every matching customer in the tenant (pets or no pets), and let you link the row — so Mike Rees and everyone else the current picker was hiding become reachable.
