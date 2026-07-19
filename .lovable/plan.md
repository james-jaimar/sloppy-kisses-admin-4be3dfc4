## Bug
The daycare enrolment "Customer & pet" picker only shows Abby, not Jackson, for Tracy Williams (SK04292).

## Root cause (verified)
`useTenantPetsWithOwners` in `src/features/daycare/queries.ts` does `select("...").eq("tenant_id", …).order("name", { ascending: true })` with no range. This tenant has **4,970 pets**, but PostgREST caps results at **1,000 rows** by default. Ordered alphabetically by pet name, "Abby" is in the first 1,000; "Jackson" is well past the cap and never reaches the client. Same picker is reused elsewhere and would silently truncate for any pet whose name sorts past ~row 1000.

## Fix
Replace the "load every pet up front" pattern with a server-side search picker.

1. **`src/features/daycare/queries.ts`**
   - Replace `useTenantPetsWithOwners(tenantId)` with `useTenantPetsWithOwnersSearch(tenantId, query)`:
     - `enabled` only when tenantId is set (empty query still runs, returning the first ~50 for the initial dropdown).
     - Build the query with `.or(...)` across `name`, `breed` on pets and use `customers!inner(...)` with a nested `.or()` on `full_name`, `first_name`, `last_name`, `customer_number`, `email` when the query is non-empty. If a single combined `.or` across the joined table is awkward, do two parallel fetches (pets-match and customer-match) and merge/dedupe by pet id.
     - Always `.limit(50)` and keep `.order("name")` so the list stays predictable.
     - Keep `staleTime` short and add `keepPreviousData` for smooth typing.

2. **`src/features/daycare/EnrolmentDrawer.tsx`**
   - Switch from the current in-memory filter to the new server-side hook: pass the debounced `query` string into `useTenantPetsWithOwnersSearch(tenantId, query)`.
   - Remove the local `.filter(...)` block; render whatever the server returns, still grouped by customer.
   - When editing an existing enrolment, fetch just the selected pet by id (small helper `usePetById`) so the trigger label shows correctly even if that pet isn't in the current search page.
   - Debounce the query (~200 ms) with a small `useEffect` + `setTimeout`, or `useDeferredValue`.

3. **Audit other pickers that share the same pattern** and fix them the same way if present (search for `.from("pets").select(` used to feed customer/pet dropdowns — likely candidates in `NewBookingModal`, `BookingFormModal`, `BookingRequestFormModal`, `PetsPage` filters). Only convert the ones used as dropdowns (not full-page lists that already paginate).

## Verification
- Load `/admin/daycare/enrolments`, open **New enrolment**, type "tracy" → both Abby and Jackson appear under Tracy Willaims (SK04292).
- Type "jackson" → Jackson appears.
- Blank search shows the first 50 pets alphabetically with no truncation warning.

## Out of scope
Fixing the "Willaims" typo on Tracy's customer record — user can edit that in the customer detail page.
