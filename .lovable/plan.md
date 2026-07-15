## Fix: customer logs in and sees "No tenant access"

### Root cause
After login, everyone is sent to `/admin/dashboard`, which is wrapped in `RequireAdmin`. `RequireAdmin` blocks any profile that isn't `platform` and has no `tenant_users` membership — customers have neither, so they hit the "No tenant access" gate instead of the portal.

### Fix (small, presentation-layer only)
1. **`src/pages/Login.tsx`** — after login, pick the landing route from `profile.user_type`:
   - `customer` → `/customer/dashboard`
   - `platform` → `/platform` (existing overview route)
   - everything else → `/admin/dashboard`
   Preserve `location.state.from` only when it matches the user's own area (don't send a customer back to `/admin/...`).
2. **`src/App.tsx`** root route (`/`) — replace the hard `Navigate to="/admin/dashboard"` with a small `<HomeRedirect />` that reads `useCurrentUser()` and routes by `user_type` the same way. Handles direct visits and refresh.
3. **`src/components/auth/RequireAdmin.tsx`** — before rendering the "No tenant access" card, if `profile.user_type === 'customer'` return `<Navigate to="/customer/dashboard" replace />`. Keeps staff seeing the real message; customers never land on the gate.
4. Sanity-check `RequireCustomer` — currently only checks `authUser`. Add a guard: if `profile.user_type !== 'customer'` and there is no linked portal customer row, redirect to `/admin/dashboard`. Prevents staff from wandering into `/customer/*`.

No schema, permissions, or edge-function changes.

### Memory update
Append to `mem://index.md` Core rules:

> Post-login routing branches on `profile.user_type`: `customer` → `/customer/dashboard`, `platform` → `/platform`, otherwise `/admin/dashboard`. `RequireAdmin` must redirect customers to their portal instead of showing "No tenant access".

### Remaining plan (unchanged, next up after this fix)
Recording the outstanding portal build order in memory so we can resume cleanly:

- **Step 3** — Customer self-signup at `/customer/signup` (pending-review flow, `customer_signup_pending` notification).
- **Step 4** — Customer change-password + comms preferences (`notify_sms`, `notify_whatsapp`, extend `_customer_notify_status`).
- **Step 5** — Pets self-service (edit, vaccination uploads → `documents`/`vaccinations`, emergency contacts).
- **Step 6** — PayFast pay button on portal invoices + payment history (reuse `payment-gateway-checkout`/`webhook`).
- **Step 7** — Booking self-cancel with cutoff from `hotel_workflow_settings` + invoice links on bookings.
- **Step 8** — Staff impersonation (`customers.portal.impersonate`, `customer-portal-impersonate` edge function, `useImpersonation()` context) — last, highest risk.

Will save this as `mem://features/customer-portal-plan` when we enter build mode so it survives future sessions.
