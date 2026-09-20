# Customer types, a second contact, and daycare list filters

Three things Charlotte asked for.

## 1. Customer types

Each customer gets one or more types: Daycare, Hotel, Cattery, Grooming, Mobile grooming, Transport, Shop.

- Types are added **automatically** the first time a customer books that service, so the whole existing book fills in by itself (a one-off pass sets them from bookings already in the system).
- Staff can **tick or untick** types by hand on the customer record. An untick sticks — a later booking won't silently put it back.
- Types show as small coloured chips on the customer record and in the customer list.
- The customers list gets a "Type" filter so Charlotte can pull up, say, every mobile grooming customer.
- The Xero-style customer export gains a "Types" column, so the same grouping reaches her spreadsheets and later reports.

## 2. Second contact (mom and dad)

A customer can have a second person on the account.

- New "Contacts" section on the customer record: name, relationship (partner, spouse, family, other), mobile, email.
- The second contact **receives copies** of booking confirmations, reminders and invoices sent to that customer. It respects the existing email on/off switch and the sending kill switch, and every copy is logged in the comms report like any other email.
- One of the two is the **account holder** — the person invoices are addressed to and the one with the portal login. Staff can switch it with a "Make account holder" button, which swaps the two people's details around on the account. A confirm step explains that invoices and the portal login move with it.
- Staff phone-number privacy still applies: where the driver view hides the customer's mobile, the second contact's mobile is hidden too.
- The second contact is separate from the existing emergency contact and vet fields — those stay as they are.

## 3. Daycare list view filters

On the Daycare board in list view:

- A search box matching pet name or owner name.
- A status filter (Expected / Checked in / Checked out / No-show / Walk-in).
- Clickable column headers to sort by pet, owner or status, both directions.
- A count of what's showing versus the full list, and a "Clear" button.
- Choices are remembered on the device, same as the board/list toggle.

## Technical notes

**Database**
- `customers.customer_types text[]` plus `customer_types_excluded text[]` (staff-removed types stay removed). Trigger on `bookings` insert maps `service_type` to a type and appends unless excluded; one-off backfill from existing bookings.
- New `public.customer_contacts` (tenant_id, customer_id, full_name, relationship, mobile, email, receives_emails, created/updated timestamps) with GRANTs, RLS mirroring `customers` policies, and an updated-at trigger. `swap_customer_account_holder(p_contact_id)` RPC performs the details swap in one transaction.

**Edge functions**
- `send-notifications` and `send-invoice-email`: after resolving the recipient, look up `customer_contacts` with `receives_emails = true` and add them as CC through the same send guard, logging each to `email_log`.

**Frontend**
- `src/features/customers/CustomerDetailPage.tsx` — type chips, editor, Contacts section.
- `src/features/customers/CustomerFormModal.tsx` — type ticks on create/edit.
- `src/features/customers/CustomersPage.tsx` + `queries.ts` — type filter.
- New `src/features/customers/ContactsPanel.tsx`.
- `src/features/daycare/DaycareListView.tsx` — search/status/sort state, persisted under `sk.daycare.list.*`.
- `src/features/reports/queries.ts` / `export_customers_for_xero` — Types column.
