## Goal
Prevent creating a second customer with the same email inside a tenant, and surface a merge warning for the historical duplicates from the import.

## 1. Database — email uniqueness guard
- Add a case-insensitive **partial** unique index on `customers (tenant_id, lower(email)) WHERE email IS NOT NULL AND status <> 'archived'`.
  - Partial + excluding archived so old duplicates aren't retroactively blocked (would fail to create otherwise).
  - Since ~50 dupes already exist among *active* rows, the index creation would fail. So instead of a hard DB constraint, we enforce via a **trigger** (`BEFORE INSERT OR UPDATE`) that raises only when the incoming row would create a NEW collision (i.e. no pre-existing collision on this pair). Message: `email_already_in_use`.
- Add helper RPC `find_customer_email_duplicates(target_tenant_id)` returning `email, ids[], count` for the merge banner.

## 2. Backend — customer-signup + invite paths
- `supabase/functions/customer-signup/index.ts`: before creating the customer row, check `customers` for existing row in tenant with same lower(email). If found → `email_already_registered` (existing behavior already covers auth users, but customer row check is missing).
- `supabase/functions/invite-user/index.ts` and `customer-portal-invite`: same pre-check.

## 3. Frontend — create/edit UX
- `src/features/customers/queries.ts` `useCreateCustomer` / `useUpdateCustomer`: catch the trigger's `email_already_in_use` and surface a friendly toast with a "View existing" action that navigates to the existing customer.
- `CustomerFormModal.tsx`: on email blur, run a lightweight lookup (`select id, full_name, customer_number where tenant_id=? and lower(email)=?`) and show inline warning "Already used by {name} — {number}" with a link.

## 4. Merge warning banner (existing dupes)
- `CustomerDetailPage.tsx`: query duplicates for this customer's email; if others exist in the tenant, render a yellow banner:
  > "This email is shared with N other customer(s): {links}. Consider merging."
- No merge tool built yet — banner + links only. Merge action can come later.

## 5. Out of scope (for now)
- Actual merge/deduplication tooling.
- Cleaning up the 50 historical duplicates.
- Phone-number uniqueness (email only, as requested).

## Technical notes
- Trigger approach chosen over unique index because we can't retroactively enforce on existing dupes without a data cleanup.
- Case-insensitive comparison via `lower(email)`.
- Scope is per-tenant (two tenants may share the same customer email).
