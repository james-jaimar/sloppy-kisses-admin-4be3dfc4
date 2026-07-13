## Scope
Daycare Board only (`/admin/daycare`). Enrolments and Attendance sub-pages untouched.

## 1. Add a List view
- Add a **Board / List** toggle in the header actions (`ToggleGroup` or two segmented buttons), persisted to `localStorage` (`sk.daycare.view`).
- **Board view**: unchanged — current two-column Expected / Checked-in cards.
- **List view**: single unified table sorted by status then pet name, with columns:
  Pet · Owner · Plan · Status · In / Out times · Actions.
  - Rows for every Expected pet + every Attendance row (deduped by pet_id like the board).
  - Status shown as a coloured pill (Expected / Checked in / Checked out / No-show / Walk-in).
  - Action column exposes the same Check in / No-show / Check out buttons the card has, using the existing `useUpsertAttendance` mutation — no new business logic.
  - Table wrapped in `sk-scroll-x` so it scrolls horizontally if the viewport is too narrow rather than crushing columns.

## 2. Names link to detail pages
- In `DaycarePetCard`: pet name → `<Link to={/admin/pets/${pet_id}}>`, owner name → `<Link to={/admin/customers/${customer_id}}>`. Coral hover, `stopPropagation` so clicks don't trip the card's action buttons.
- Same treatment in the new List view rows.
- Confirmed both routes exist in `App.tsx` (`/admin/pets/:id` → `PetDetailPage`, `/admin/customers/:id` → `CustomerDetailPage`).

## 3. Tablet layout rethink
Problem today: at `md`/`lg` widths the two lanes (Expected + Checked-in) each get a `sm:grid-cols-2` inner grid → four cramped columns of cards, and the header action row (Today + prev/date/next) overflows.

- Break the two-column layout: switch the lane grid from `lg:grid-cols-2` to `xl:grid-cols-2`. On tablet the lanes stack, each with a comfortable `sm:grid-cols-2` inner grid of full-width cards.
- Header actions: on `< md`, drop the "Today" button label to just the icon, and shrink the min-width of the date pill from `220px` to `160px` on `< md`.
- Stat cards: keep `grid-cols-2 md:grid-cols-4`.
- On tablet default the view to **List** (denser, better use of width) — but respect the user's persisted choice once they've toggled.
- Page padding tightened: `p-4 sm:p-6`.

## Out of scope
- No changes to enrolments, attendance history, swap-in logic, queries, or the mutation surface.
- No visual redesign of the pet card beyond adding two links.
- No changes to the global app shell (already responsive).

## Technical notes
- New file: `src/features/daycare/DaycareListView.tsx` — renders the unified table given the same `expected`/`attendance` inputs the board already computes; reuses `useUpsertAttendance`.
- `DaycareBoardPage.tsx` extracts the derived `expectedItems`/`checkedIn`/etc. once and passes them to either `<BoardView />` or `<ListView />`.
- View toggle stored in `localStorage` with a `useIsTablet()` fallback for the initial default.
