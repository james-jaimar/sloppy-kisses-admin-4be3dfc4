## Goal

Replace all hard-coded pieces on the Admin Dashboard (`src/features/dashboard/AdminDashboard.tsx`) with live tenant-scoped queries. Customers/Pets counters already use real data — keep those. Everything else becomes dynamic.

## What becomes dynamic

1. **Header greeting** — use signed-in user's first name (from `profiles.full_name`) instead of hard-coded "Charlotte".

2. **Five stat cards (today's counts)** — count `bookings` for today (tenant, `start_at` within local day) grouped by service type:
   - Today's Grooming — grooming service bookings
   - Mobile Appointments — grooming bookings on a mobile van resource (or `booking_type = 'mobile_grooming'`)
   - Daycare Dogs — daycare bookings today
   - Hotel Guests — hotel/cattery bookings overlapping today (start ≤ today, end ≥ today)
   - Pick Ups / Drop Offs — transport bookings today
   - Delta vs yesterday computed from the same queries; drop the arrow if delta = 0.

3. **Today's schedule (main list)** — real `bookings` for today ordered by `start_at`: show time, pet name(s) via `booking_pets`+`pets`, customer name, service label, assigned resource (groomer / van / room), and live `status`. Cap at ~8 rows with "Open calendar" link to `/admin/calendar`.

4. **Daycare check-in card** — counts from `daycare_attendance` (or today's daycare bookings) for the current date:
   - Expected = today's confirmed daycare bookings
   - Checked in = attendance rows with `checked_in_at not null`
   - Not arrived = expected − checked_in − walk_in
   - Walk-ins = attendance rows flagged walk-in
   - "Open daily list" → `/admin/daycare/attendance`.

5. **Recent activity** — pull latest ~8 rows from `activity_log` (fallback to `booking_status_events` + `invoice_events` union) for the current tenant, newest first. Format `who / what / target / when` with `date-fns` `formatDistanceToNow`.

## Implementation

- New file `src/features/dashboard/queries.ts` with focused hooks:
  - `useDashboardTodayStats()` — one query returning `{ grooming, mobile, daycare, hotel, transport }` for today and yesterday.
  - `useTodaysSchedule()` — bookings today with joined pet/customer/resource.
  - `useDaycareCheckinSummary()` — attendance/booking counts.
  - `useRecentActivity(limit=8)` — activity_log rows.
- Each hook resolves `tenant_id` from `TenantContext` (matches existing patterns in `features/bookings/queries.ts` etc.).
- Rewrite `AdminDashboard.tsx` to consume these hooks. Preserve current visual layout, tone colors, and card structure — data source is the only change. Show `…` skeletons while loading; render an empty-state row when a section has zero rows (e.g. "No bookings scheduled for today").
- Remove `demoTodayGrooming` import from the dashboard (leave `constants/demoData.ts` untouched — other files may still use it).

## Out of scope

- No schema changes; no new migrations.
- No changes to visual design, tokens, or layout.
- PayFast work stays as-is.

## Technical notes

- Reuse `useCurrentUser()` for the greeting name.
- "Today" boundaries computed in browser local time as ISO strings for `.gte()` / `.lt()` filters on `start_at`.
- Hotel occupancy uses overlap: `start_at < endOfDay AND end_at > startOfDay`.
- If `activity_log` is empty for the tenant, fall back to an empty state — do not synthesize demo rows.
