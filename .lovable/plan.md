## Phase 9 — Customer Portal

Phase 8 shipped comms + vaccination gate on the operator side. The customer-facing shell already exists (`/customer/*` routes, `CustomerLayout`, `RequireCustomer`, sidebar entries for Dashboard, Pets, Bookings, Documents, Invoices, Payments, Profile) but most pages are placeholders. Phase 9 turns that shell into a real self-service portal so customers can manage their pets, request bookings, upload vaccination certificates, and pay invoices — without any operator touch.

### What we'll build

1. **Customer dashboard (`/customer/dashboard`)**
   - Greeting, next upcoming booking card (service, pet, date, resource, status chip), outstanding balance card (link to invoices), pets-needing-attention card (expired/expiring vaccines), quick actions: "Book again", "Add pet", "Upload vaccine".
   - Recent activity feed: last 5 bookings + last 5 comms received.

2. **My Pets (`/customer/pets`, `/customer/pets/:id`)**
   - List of the signed-in customer's pets with photo, species/breed chip, age, vax status chip.
   - Detail: edit basic info (name, DOB, breed, weight, temperament notes, feeding, meds, vet). Vaccinations tab reusing `PetVaccinationsPanel` in read+upload mode — customer can add records + upload certificate to storage; `verified_by/verified_at` stays null until an operator verifies.
   - "Add pet" flow that mirrors the operator `PetFormModal` but scoped to the current customer.

3. **Bookings (`/customer/bookings`, `/customer/bookings/:id`, `/customer/bookings/new`)**
   - List split into Upcoming / Past with status chip, service icon, pet, date, resource, balance-due badge.
   - Detail: read-only summary + "Request change", "Request cancellation" buttons that write a `booking_requests` row (not direct edits).
   - New request: pick service → pet(s) → preferred date/time → notes → submits as a `booking_requests` row for the operator queue (reuses existing `booking_requests` table + operator `/admin/booking-requests` inbox).

4. **Documents (`/customer/documents`)**
   - List of files the customer can access: their invoices (PDF), their pets' vaccination certificates, signed intake forms.
   - Download + upload-new-vaccine shortcut.

5. **Invoices & Payments (`/customer/invoices`, `/customer/invoices/:id`, `/customer/payments`)**
   - Invoices list scoped by `customer_id = me`, status chips reused from `features/invoices/status.tsx`.
   - Invoice detail: line items, totals, download PDF, "Pay now" (stub button that opens a modal listing enabled payment methods — real gateway integration is Phase 10).
   - Payments list: read-only history of payments recorded against the customer.

6. **Profile (`/customer/profile`)**
   - Edit name, mobile, email, address, suburb, emergency contact.
   - Notification preferences (`notify_email`, `notify_whatsapp`, `notify_sms`) — wire the toggles the dispatcher already respects.
   - Change password (reuse `ChangePasswordPage`).

### Access & data model

- Customers already authenticate via Supabase auth and are linked to a `customers` row through `auth_user_id` (existing pattern used in `RequireCustomer` / `CustomerDashboard`). Portal queries filter by `customer_id = (select id from customers where auth_user_id = auth.uid())`.
- RLS: audit every table the portal reads (`customers`, `pets`, `pet_vaccinations`, `bookings`, `booking_pets`, `booking_requests`, `invoices`, `invoice_lines`, `payments`, `notification_events`, `documents`/storage). Add "customer can read own" + "customer can insert own" policies where missing. All write policies stay scoped to `auth_user_id`; operators keep tenant-wide access via existing `user_has_tenant_access` policies.
- New permissions (operator-side) if any: none — portal is customer-role only.
- Storage: reuse the vaccination-certificates bucket from Phase 8; add a customer-scoped policy so a customer can upload/read only files under `pets/<pet_id>/…` for their own pets.
- Booking-change/cancellation requests reuse the existing `booking_requests` table (add a `kind` column if it doesn't already distinguish "new" vs "change" vs "cancel", plus `related_booking_id`).

### Technical notes

- Files (planned):
  - `src/features/customerPortal/CustomerDashboard.tsx` (upgrade the existing placeholder)
  - `src/features/customerPortal/pets/{MyPetsPage,MyPetDetailPage,MyPetFormModal}.tsx`
  - `src/features/customerPortal/bookings/{MyBookingsPage,MyBookingDetailPage,NewBookingRequestModal}.tsx`
  - `src/features/customerPortal/documents/MyDocumentsPage.tsx`
  - `src/features/customerPortal/invoices/{MyInvoicesPage,MyInvoiceDetailPage,PayInvoiceModal}.tsx`
  - `src/features/customerPortal/payments/MyPaymentsPage.tsx`
  - `src/features/customerPortal/profile/MyProfilePage.tsx`
  - `src/features/customerPortal/queries.ts` (shared "current customer" hook + scoped queries)
- Route wiring in `src/App.tsx` under the existing `RequireCustomer` group; sidebar in `src/constants/navigation.ts` already lists the entries.
- Migration:
  - New RLS policies (SELECT own for `pets`, `pet_vaccinations`, `bookings`, `booking_pets`, `invoices`, `invoice_lines`, `payments`, `notification_events`; INSERT own for `pet_vaccinations`, `booking_requests`, `documents`).
  - `booking_requests`: add `kind` (`new`/`change`/`cancel`) + `related_booking_id` if missing.
  - Storage policy for the vax-certs bucket scoped by customer ownership.

### Out of scope (deferred)

- Real online payment gateway (PayFast/Yoco/Stripe) — Phase 10.
- Loyalty points / package credit purchases in the portal — Phase 10.
- Two-way messaging (customer ↔ operator) — Phase 8c.
- Guest checkout / public booking widget for non-customers — later.

### Verification

- Sign in as a customer → dashboard shows next booking + outstanding balance from real data.
- Add pet + upload rabies certificate → row appears in `pet_vaccinations`, file lands in storage, operator sees it unverified.
- Request a new booking → row appears in operator `/admin/booking-requests` queue.
- Toggle notify_email off in profile → dispatcher marks next event `skipped` for that customer.
- Customer A cannot read customer B's pets, bookings, invoices, or certificates (RLS test).

Shall I proceed with Phase 9 as above?
