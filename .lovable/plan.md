
# Customer account control + Customer Portal v1

Two-part plan: (A) staff-side control of customer portal accounts, (B) rounding out the customer portal to a real v1 with online payment via PayFast.

## A. Staff-side customer account controls

Add a **Portal access** panel on the Customer detail page (permission: `customers.portal.manage`):

1. **Status pill** — shows one of: *Not invited*, *Invited (pending)*, *Active*, *Disabled*, with the linked auth email.
2. **Invite to portal** — button on any customer without a linked auth user. Calls new edge function `customer-portal-invite` which:
   - Uses service role to create an auth user (or find existing by email).
   - Creates/links a `profiles` row (`user_type='customer'`) and sets `customers.linked_profile_id` + `portal_access_enabled=true`.
   - Sends a Supabase invite email (reuses existing auth-email pipeline).
3. **Send password reset** — button; calls `customer-portal-reset` edge fn → `admin.generateLink('recovery')` and emails via existing mailer.
4. **Disable / re-enable access** — toggles `customers.portal_access_enabled`. RLS helper `current_customer_id` already checks this flag, so a disabled customer instantly loses portal read access without deleting the auth user.
5. **Unlink auth user** — clears `linked_profile_id` and disables access; leaves auth user intact (in case wrong person was linked). Then staff can invite the correct email.
6. **Impersonate (view-as)** — staff with permission `customers.portal.impersonate` click "View as customer" → opens `/customer/*` routes in a read-only banner mode. Implemented via a `useImpersonation()` context populated from a signed short-lived token minted by `customer-portal-impersonate` edge fn. All portal queries read `impersonatedCustomerId` when set (a staff-only path through RLS using `user_has_tenant_access`, not `current_customer_id`). Writes disabled; every session logged to `activity_log`.

Also add **Self sign-up**:
- New public route `/customer/signup` (email + password + name + mobile).
- On submit, create the auth user; edge fn `customer-portal-signup-link` looks for a `customers` row in the tenant whose email matches:
  - **Match found & not yet linked** → link + enable access → land on portal dashboard.
  - **No match** → create a customer record with `status='pending_review'`, `portal_access_enabled=false`, notify staff via `notification_events` (event `customer_signup_pending`); user sees a "Waiting for approval" screen until staff approve on the Customer detail page.
- New Admin inbox item: "Pending customer signups" list on the Customers page.

Tenant selection for self-signup: single-tenant today, so the signup form is fixed to the default tenant; multi-tenant later can add a tenant slug in the URL.

## B. Customer Portal v1 scope

Existing pages (`CustomerDashboard`, `MyBookings*`, `MyPets*`, `MyDocuments`, `MyInvoices*`, `MyProfile`) get finished and joined up:

**Bookings**
- Keep list + detail + new-request flow.
- Add **Cancel** button on `MyBookingDetailPage` — only if `start_at` more than N hours away (N from `hotel_workflow_settings` / `daycare_workflow_settings` cancellation cutoff). Otherwise show "Contact us to cancel". Cancel sets `booking_requests` status or, for confirmed bookings, creates a `cancellation_request` notification event for staff (no self-cancel of confirmed).
- Show attached invoice link where present.

**Invoices + online payment (PayFast)**
- `MyInvoicesPage` already lists; add filter chips (Outstanding / Paid / All).
- `MyInvoiceDetailPage`: replace the current "coming soon" modal with a real **Pay with PayFast** button when `tenant_gateway_enabled(tenant,'payfast')` is true. Reuses existing `payment-gateway-checkout` edge fn (already scaffolded) to build a signed PayFast form and redirect. On return, `payment-gateway-webhook` marks the payment; the portal shows success/failure via existing `PayResultPages`.
- Show payment history (from `payments` table) and any applied credit notes.
- Download PDF already wired.

**Pets self-service**
- `MyPets` list + `MyPetFormModal` already exist. Complete:
  - Vaccination upload → writes to `documents` + `vaccinations` (status `pending_review`); staff verify in admin.
  - Emergency contacts CRUD (uses `emergency_contacts`).
  - Feeding / meds / vet fields editable on the pet form.
  - Read-only vax expiry chips with "Upload new certificate" CTA when expiring.

**Profile + comms preferences + password**
- `MyProfilePage` exists; add:
  - **Change password** page `/customer/profile/password` (link is already there) → `supabase.auth.updateUser({ password })` with current-password re-auth.
  - Comms preferences: keep the `notify_email` checkbox; add `notify_sms` and `notify_whatsapp` columns to `customers` (migration) so the same UI can toggle each channel. Notifications dispatcher already respects `notify_email`; extend `_customer_notify_status` to check the relevant channel.

**Dashboard polish**
- Show a "Portal access disabled" empty state if `portal_access_enabled=false` (should never appear for a signed-in customer, but guards impersonation edge cases).
- Add a "Documents needing attention" tile (expired/expiring vaccinations).

## Technical details

**Migrations**
1. `customers`: add `notify_sms boolean default true`, `notify_whatsapp boolean default false`, `signup_status text default 'active' check (signup_status in ('active','pending_review','disabled'))`.
2. New permission codes: `customers.portal.manage`, `customers.portal.impersonate`. Seeded to the Owner role.
3. New `notification_events` types: `customer_signup_pending`, `password_reset_requested`, `portal_invited`.
4. RLS: no schema changes to helpers — `current_customer_id` already gates on `portal_access_enabled`; staff impersonation goes through `user_has_tenant_access` so no policy widening is needed.

**Edge functions** (new)
- `customer-portal-invite` — create/link auth user, send invite.
- `customer-portal-reset` — send password reset link.
- `customer-portal-signup-link` — self-signup match/pending flow.
- `customer-portal-impersonate` — mint short-lived staff impersonation token (5 min, single-use, logged).

Reuses existing: `payment-gateway-checkout`, `payment-gateway-webhook`, `send-notifications`, `auth-email-hook`.

**Front-end additions**
- `src/features/customers/PortalAccessPanel.tsx` (staff, on customer detail).
- `src/pages/CustomerSignup.tsx` + route.
- `src/features/customerPortal/impersonation/*` (context + banner).
- `src/features/customerPortal/invoices/PayFastButton.tsx`.
- `src/features/customerPortal/profile/ChangePasswordPage.tsx`.
- `src/features/customerPortal/pets/VaccinationUploader.tsx`.

**Payments prerequisite**
PayFast credentials are already per-tenant (`payment_providers.settings jsonb`, per your saved rule). Tenant admin enters them in **Settings → Payments** (existing `PayFastConnectDialog`). Nothing to store in Deno env.

## Suggested build order

1. Migration (customers columns, permissions, event types).
2. Staff Portal Access panel + invite/reset/disable/unlink + edge functions.
3. Self-signup route + pending-review inbox.
4. Change password page + comms channel toggles.
5. Pets vaccination upload + emergency contacts.
6. PayFast pay button + payment history on invoice detail.
7. Booking self-cancel with cutoff.
8. Impersonation (last — highest risk, needs audit review).

Ship after step 6 as a usable v1; 7–8 as fast follow-ups.
