## Post-security-fix impact audit

Goal: verify the recent security migrations didn't break UX or functionality. The changes revoked EXECUTE from `anon`/`authenticated`/PUBLIC on many SECURITY DEFINER functions and tightened two RLS policies (branding storage, booking_status_events insert). Those are the exact surfaces most likely to have collateral damage.

### 1. Static audit — find every call site that touches the changed surfaces

- Grep the frontend + edge functions for every RPC whose grants were narrowed:
  `next_booking_number`, `next_customer_number`, `next_pet_number`, `next_invoice_number`, `next_credit_note_number`, `apply_credit_note`, `allocate_customer_credit`, `park_customer_credit`, `adjust_customer_credit`, `record_manual_refund`, `void_refund`, `mark_invoice_sent`, `user_has_permission`, `get_public_invoice`, `tenant_gateway_enabled`, `log_invoice_event`, plus the trigger helpers.
- For each hit, confirm the caller is `authenticated` (frontend) or uses service role (edge function). Flag any anon call path — especially the public invoice page and public intake form.
- Grep for storage reads/writes on the `tenant-branding` bucket and confirm every path prefixes the tenant id as the first folder segment (new policy requires `user_has_tenant_access` on segment 1).
- Grep for direct inserts into `booking_status_events` from the client — new policy requires `bookings.manage`. Confirm all mutations happen via the trigger (server-side) rather than client inserts.

### 2. Runtime smoke test via Playwright against localhost

Log in with the injected Supabase session and click through the flows most exposed to the changes:

- Admin dashboard loads (exercises `user_has_permission`, tenant scoping).
- Create a booking → confirms `next_booking_number` still callable + `log_booking_status_change` trigger writes to `booking_status_events`.
- Change booking status → confirms status-event trigger insert still works under new INSERT policy.
- Open Invoices list, open one invoice, record a payment → exercises `log_invoice_event`, `payments_log_invoice_events`.
- Issue + apply a credit note → exercises `apply_credit_note`, `credit_note_recompute_totals`, `credit_note_items_set_line_total`.
- Open Branding Settings, view/upload logo → exercises `tenant-branding` storage policy.
- Open a public invoice link (anon) → exercises `get_public_invoice` (only RPC anon should still reach).
- Customer portal login → exercises `current_customer_id`, `user_can_access_pet`, `user_can_access_customer`.

Capture screenshots + console/network errors at each step. Any 401/403/`permission denied for function` output is a regression to fix.

### 3. Supabase linter re-run + edge-function log spot-check

- Run `supabase--linter` to confirm no new errors were introduced.
- Skim recent edge-function logs (`send-invoice-email`, `send-notifications`, `payment-gateway-*`, `invite-user`) for `permission denied` or `function ... does not exist` since the migration timestamp.

### 4. Report

Produce a short report grouped as:
- **Broken** — reproducible failures with exact call site and suggested one-line fix (usually re-GRANT to `authenticated` or `service_role`).
- **Suspect** — code paths whose calling role I couldn't confirm; needs a quick user check.
- **Clean** — surfaces exercised without regression.

No code changes in this pass — findings first, fixes proposed after you review.
