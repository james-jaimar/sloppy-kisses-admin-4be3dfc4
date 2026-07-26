## Confirmed current state

- `AdminDashboard.tsx` renders a "Today ›" button with no `onClick` handler — it's a placeholder.
- All dashboard queries (`useDashboardTodayStats`, `useTodaysSchedule`, daycare check-in) are hardcoded to "today" with no date parameter.
- `AppHeader.tsx` renders a "Quick add" button (line 57) with no `onClick` — placeholder everywhere the header appears.

## Plan

### 1. Dashboard date navigator
- Replace the placeholder "Today" button with a real date picker in `AdminDashboard.tsx`:
  - Prev day / date label / Next day chevrons, plus a "Today" reset (matching the pattern used on `GroomingBoardPage` and `HotelBoardPage` for consistency).
  - Local `selectedDate` state.
- Add a `date?: Date` param to `useDashboardTodayStats`, `useTodaysSchedule`, and the daycare check-in query in `src/features/dashboard/queries.ts`. Default to today when omitted. Include the date in the query key so cache is per-day.
- Update the greeting subtitle to say "Good morning …" only when the selected day is today; otherwise show e.g. "Showing Tue, 28 Jul 2026".
- Update the "Daycare check-in" card heading from "Live count for today" to reflect the selected day.

### 2. Quick add menu (global header)
- Turn the "Quick add" button in `AppHeader.tsx` into a dropdown (same click-outside pattern already used for the profile menu).
- Menu items (permission-gated via existing `Can`/`hasPermission`):
  - New booking → open `NewBookingModal`
  - New customer → open `CustomerFormModal`
  - New pet → open `PetFormModal`
  - New invoice → navigate to `/admin/invoices` and trigger `NewInvoiceDrawer` (or route with `?new=1`)
  - New daycare enrolment → open `EnrolmentDrawer`
- Since `AppHeader` is presentational, wire the modals via a small `QuickAddProvider` context (mounted in `AdminLayout.tsx`) that exposes `openQuickAdd(kind)`; the header calls into it. This keeps the header reusable and avoids duplicating modal state per page.
- Hide the menu entirely in Platform/Customer layouts (or show a reduced set) — Quick add is admin-only.

### 3. Out of scope
- No changes to the underlying booking/customer/pet form components; only their open triggers.
- No changes to search input (still placeholder — separate task).

## Technical notes

- Files touched:
  - `src/features/dashboard/AdminDashboard.tsx` — date state + navigator UI.
  - `src/features/dashboard/queries.ts` — accept `date` param; adjust SQL date filters to `[startOfDay(date), endOfDay(date))`.
  - `src/components/layout/AppHeader.tsx` — replace static button with dropdown wired to context.
  - `src/components/layout/AdminLayout.tsx` — mount `QuickAddProvider` + hosted modals.
  - New `src/components/quickAdd/QuickAddProvider.tsx`.
- Permissions used: `bookings.create`, `customers.manage`, `pets.manage`, `invoices.create`, `daycare.manage` (fall back gracefully if a permission helper doesn't exist — verify in `permissions.ts` during build).
