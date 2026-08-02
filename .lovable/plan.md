## Goal

Delete the "booking request" intermediate step from the whole product. Admins and customers create real bookings directly. Customers can cancel or move their own bookings from the portal, with a warning (not a block) when they are inside the notice window.

## 1. Remove Booking Requests from the admin

- Drop the **Booking Requests** item from the admin sidebar (`src/constants/navigation.ts`) and the `/admin/booking-requests` route in `src/App.tsx`.
- Delete `src/features/bookingRequests/` (queue page, form modal, convert helper, queries).
- Remove the requests badge from `src/components/layout/useNavBadges.ts`.
- Remove the "View booking requests" button and the `?request=` deep-link handling from the calendar empty state (`src/features/calendar/CalendarWeekView.tsx`).
- Strip the now-dead `booking_request_id` plumbing from `src/features/bookings/BookingFormModal.tsx`, `bookings/queries.ts`, `bookings/recurringQueries.ts`, and the demo fixture in `src/constants/demoData.ts`.

Admins already create bookings through the calendar "New booking" flow and Quick Add, so nothing replaces the queue.

## 2. Remove Requests from the customer portal

- Drop the **Requests** sidebar item and the `/customer/requests` route.
- Delete `MyRequestsPage.tsx`, `NewBookingRequestModal.tsx` and `bookings/new/useRequestSubmit.ts`.
- Remove the "Pending requests" tile from the portal dashboard and replace it with an "Unpaid invoices" tile (balance owing + link to invoices), which is what actually needs the customer's attention now.
- `DaycareRequestWizard` is the last screen still writing a request. It will submit through the same edge function as the other services, creating the daycare **enrolment** for the next billing month directly (the existing enrolment trigger raises the invoice). Wording changes from "Send request" to "Confirm enrolment".

## 3. Customer cancel and reschedule (direct, no approval step)

Two new security-definer database functions, both restricted to the signed-in customer who owns the booking:

- `portal_cancel_booking(booking_id, reason)` — refuses if already cancelled/completed/checked-out, otherwise sets the booking to cancelled and appends an internal note recording that the customer cancelled and why.
- `portal_reschedule_booking(booking_id, new_start, new_end)` — refuses past dates and closed bookings, otherwise moves the booking in place, keeping the same booking number and invoice, and logging the old times in the internal notes.

The existing `bookings_notify_changes` trigger already queues `booking_cancelled` and `booking_rescheduled` notifications, so staff and customer comms fire automatically.

### Portal UI (`MyBookingDetailPage`)

- **Cancel booking** opens a confirm dialog. If the booking starts inside the notice window (grooming hours / hotel days from Policy settings), the dialog shows an amber warning: "This is inside our X notice period — a cancellation fee may apply and our team will be in touch." It still lets them proceed.
- **Move booking** opens a reschedule dialog. Grooming uses the existing availability slot picker; hotel and transport use date/time fields. The same late-change warning appears when applicable.
- Both actions are hidden once a booking is cancelled, completed or checked out.

## 4. Comms templates

Keep the historic `booking_request_created` / `booking_request_status_changed` template codes out of the pickers in Message templates and the variable catalog, and add `booking_rescheduled` where it is missing.

## Technical notes

- The `booking_requests` table and its existing rows are left in place — nothing in the app reads or writes it after this change, so no data is destroyed and the audit trail survives.
- Cancellation fees are **not** auto-charged; staff apply them from the invoice as they do today.
- The cancel/reschedule functions are granted to `authenticated` only, and ownership is checked with `current_customer_id(tenant_id)` so one customer can never touch another's booking.
