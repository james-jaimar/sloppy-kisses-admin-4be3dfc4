## Goal

Build the Front Desk experience once, so each department day screen doubles as the screen that department's own staff see. Front Desk gets a big-icon home, department-first navigation, no calendar/credit notes/reports, and payment *flags* plus read-only invoice viewing.

## 1. Home launcher

New route `/admin/home`, and post-login routing sends tenant staff there instead of `/admin/dashboard` (owner/admin roles can still pin the dashboard — the launcher links to it).

Layout: a responsive grid of large tap-friendly tiles (laptop and tablet), each showing icon, label and a live count for today:

```text
[ Daycare 12 in ]  [ Hotel & Cattery 4 ]  [ Grooming 6 ]
[ Mobile vans 3 ]  [ Pick up / Drop off 2 ]  [ Customers ]
[ Pets ]           [ Bookings ]             [ Dashboard ]
```

Tiles render only when the user has the matching `*.view` permission, so a groomer sees just Grooming, and Front Desk sees the set above. Attention badges (unpaid job today, missing vax, unassigned resource) surface on the tile as a coral dot with a count.

## 2. Navigation clean-up

- Hide Calendar from users without `calendar.view`; remove `calendar.view` from the Front Desk role so it disappears for them (route and page stay for admins/owner).
- Add "Home" as the first sidebar item.
- Front Desk role permissions: dashboard, customers, pets, bookings (view/create/update/cancel), daycare, hotel, grooming, transport, documents, comms, `invoices.view` + `payments.view`. Explicitly not: reports, credit notes, invoice create/update/send/void, payments.create, settings, users.

## 3. Shared department day screen

Each department already has an admin board (Daycare, Hotel & Cattery, Grooming, Mobile Vans, Pick up / Drop off). We standardise them into one shape and gate the actions:

- Common header: day stepper, department name, search, status filter chips, attention counter.
- Common row/card: pet + owner, time, status pill, and status chips for **Unpaid / Overdue / Vax missing / Unassigned**.
- Action layer split by permission:
  - `*.view` — read the day, open a booking.
  - `bookings.create` / `bookings.update` — add, edit, reschedule, cancel (Front Desk).
  - `work.*` — check-in / start / ready / sign-off, checklists, photos, incidents (floor staff, already built at `/work`).

Front Desk gets both booking and floor actions on the same screen; a groomer opening the same screen sees the floor actions only. The existing `/work` tablet views remain the stripped-back phone-sized entry point and keep sharing the same queries.

## 4. Payment flags + read-only invoices

- Booking and department queries return `invoice_status` (none / draft / issued / overdue / paid) per booking so the boards can show a red "Unpaid" chip on today's and tomorrow's jobs.
- Booking detail shows a payment strip: amount, status, due date, and "View invoice" if permitted.
- With `invoices.view` but without `invoices.update|send|void|create` and without `payments.create`, the invoice detail page renders read-only: no edit, send, void, credit-note or record-payment buttons. Invoices & Payments stays out of the sidebar for Front Desk — they reach an invoice only from a booking or customer record.

## 5. Order of work

1. Permission/role updates + Front Desk role preset (migration) and nav gating.
2. Home launcher page with permission-filtered tiles and live counts.
3. Invoice status on booking queries + payment chips and booking payment strip.
4. Read-only mode on the invoice detail page.
5. Standardise the five department day screens on the shared header/row/action-gate pattern.
6. Settings screen entry so the owner can adjust which tiles/permissions a role gets (per the settings-first rule).

## Technical notes

- New `FrontDeskHome` under `src/features/home/`, tiles driven by a config array mirroring `src/constants/navigation.ts` with `code` gating via `hasPermission`.
- Counts reuse existing per-department queries plus `useNavBadges` style aggregation; one batched query rather than one per tile.
- Post-login branch in `src/pages/Index.tsx` / `Login.tsx` changes `/admin/dashboard` → `/admin/home`.
- Shared board primitives (`DayHeader`, `JobRow`, `StatusChips`) in `src/features/shared/board/` so Daycare/Hotel/Grooming/Vans/Transport pages converge instead of each re-implementing.
- Invoice read-only gating done in the page component from permissions; RLS already prevents writes server-side.
