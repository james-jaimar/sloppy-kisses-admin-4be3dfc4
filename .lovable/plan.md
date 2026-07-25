# Customer Portal — QA pass + gap fixes

The portal is fully scaffolded (dashboard, pets, bookings + 4 request wizards, invoices with PayFast pay, payments, documents, profile + password, notification prefs, auto-approve signup). Rather than rebuild, this plan is a structured **test pass** followed by a targeted **gap-fix sprint** for the things the walkthrough will expose.

## Phase A — Guided QA walkthrough (no code)

Together, in this order, on the live preview. Each step ends with pass / fail / note.

1. **Sign-up + first login** — `/customer/signup` → verify auto-login lands on `/customer/dashboard`, welcome data correct.
2. **Profile & prefs** — edit contact, toggle email/SMS/WhatsApp, change password, log out + back in.
3. **My Pets** — add a pet, edit, upload photo, add vaccinations (does the upload flow work end-to-end from portal?).
4. **Bookings** — Upcoming / Past tabs, drill into a booking, `Request change` and `Cancel booking` — verify admin sees the request in the Booking Requests queue.
5. **Request booking wizards** — walk through all four (Hotel, Daycare, Grooming in-house, Grooming mobile, Transport). Confirm the customer sees a **price preview** in each and the request lands in admin queue with the right payload.
6. **Invoices** — list filters, drill in, download PDF, `Pay` button → PayFast redirect → success page → invoice marks paid.
7. **Payments** — history renders, links back to invoices.
8. **Documents** — vaccination certificates visible for the customer's pets only (see gap D1 below).
9. **Mobile / tablet** — every page on 375px + 768px, sidebar → top bar, tables scroll cleanly.

## Phase B — Gap fixes (build after walkthrough)

Everything below is either a known gap or something I expect the walkthrough to flag. Confirm/re-order after Phase A.

### B1. Dashboard hero upgrades
- Outstanding invoices list (top 3, "Pay" button inline).
- "Pending requests" chip showing `booking_requests` where status ∈ (`pending_review`, `needs_info`) with a link.
- Recent activity feed (last 5 events: booking confirmed, invoice sent, payment received) from `notification_events`.

### B2. My Requests page (new)
- New route `/customer/requests` and sidebar entry, showing every `booking_requests` row the customer submitted, current status, and admin reply. Today a customer submits a wizard and it disappears from view.

### B3. Booking detail — customer-friendly
- Show price / balance for the linked booking + invoice, add-ons, vax status ("All up to date" / "Missing: rabies").
- Hide staff-only fields (`resource.name`).
- "Reschedule" wizard (opens the same service wizard prefilled) instead of a generic notes-only request.

### B4. Documents (D1 fix)
- Current query `pet_id.not.is.null` leaks docs across customers. Restrict to `customer_id = me` OR `pet_id IN (my pets)`.
- Add "Upload vaccination certificate" flow (pet picker + file → `documents` + link to `vaccinations` for admin verification). Portal-side counterpart to admin's vax gate.

### B5. Invoices & Payments
- **Statement** — download `Customer statement` PDF (reuse `/admin/customers/:id/statement`).
- **Credit notes** — list under `/customer/invoices` with a "Credit notes" tab (read from `credit_notes` filtered by `customer_id`).
- **Pay options** — also surface Yoco / Stripe once enabled in `payment_providers` (today only PayFast branch exists).
- **Proof of payment upload** — for offline methods (EFT), let the customer attach POP against an invoice.

### B6. Comms inbox for the customer
- New route `/customer/messages` reading `notification_events` where `customer_id = me` and status ∈ (`sent`, `queued`). Lets the customer re-read confirmations and reminders without hunting through email.

### B7. Pricing confirmed everywhere
- Sweep each of the four request wizards, confirm `HotelExtrasPanel` / `GroomingExtrasPanel` / transport suburb pricing render a live estimate before submit.
- Add a "This is an estimate — final price on confirmation" microcopy line to avoid disputes.

### B8. Responsive polish
- Portal tables → cards on `<sm`.
- Booking detail action bar becomes a sticky bottom bar on mobile.
- Sidebar drawer close-on-navigate check across `MobileTopBar`.

### B9. Small correctness items
- `MyProfilePage.save` writes `notify_email/sms/whatsapp` — confirm those columns exist and RLS allows update (spot-check).
- Booking `Cancel` should require a reason (currently just a notes field) and set request `kind='cancel'` correctly.
- Empty-state illustrations for pets, bookings, invoices, documents.

## What I need from you

1. Approve the plan or tell me to reorder / drop items.
2. Then we walk through **Phase A together on the preview** — I'll drive with a fresh test customer and we tick items off. Anything that fails moves into Phase B and gets built.
