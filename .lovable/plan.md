## Simplify customer self-signup — no review, auto sign-in

The user wants signups approved automatically and to land on the dashboard immediately.

### Changes

1. **`supabase/functions/customer-signup/index.ts`**
   - Set `signup_status: "active"` on the new customer row (was `"pending_review"`).
   - Stop writing the `customer_signup_pending` notification event.
   - Everything else (auth user creation, profile, customer link, portal enabled) stays as-is.

2. **`src/pages/CustomerSignup.tsx`**
   - After the edge function returns `ok`, call `supabase.auth.signInWithPassword` with the same email + password, then `navigate("/customer/dashboard", { replace: true })`.
   - Remove the "account created, awaiting review" confirmation screen and the 3.5s auto-redirect timer.
   - If auto sign-in fails for some reason, fall back to sending them to `/login` with a friendly message.

3. **`src/App.tsx` + `src/constants/navigation.ts`**
   - Remove the `/admin/customer-signups` route, the nav entry, and the `CustomerSignupsPage` import. Nothing to review anymore.
   - Delete `src/features/customers/CustomerSignupsPage.tsx`.

4. **Memory (`mem://features/customer-portal-plan.md`)**
   - Update the "Done" section: signups are auto-approved; no staff queue.

### Out of scope (no changes)
- DB schema: `signup_status` column and permission codes stay — cheap to keep and useful if you ever want to reintroduce review.
- Impersonation still deferred (separate high-risk pass).
