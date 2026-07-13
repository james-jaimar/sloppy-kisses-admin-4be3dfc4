## Goal
Make the entire Sloppy Kisses admin + customer portal usable on tablet and mobile, not just desktop.

## Current state (why it breaks)
- `AppSidebar` is `hidden lg:flex` — below 1024px there is **no navigation at all**. Users on tablet/mobile are stranded on whatever route they land on.
- All layouts (`AdminLayout`, `PlatformLayout`, `CustomerLayout`) assume a permanent left rail; main content has no mobile top bar, no menu button, no drawer.
- Pages are built desktop-first with wide tables, multi-column grids, fixed min-widths (booking board, grooming board, hotel occupancy grid, van timeline, calendar week view, invoice/credit-note detail, customers/pets/users tables, settings pages).
- Modals (`NewBookingModal`, `BookingFormModal`, `InviteUserModal`, `CustomerFormModal`, `PetFormModal`, etc.) use fixed widths and dense grids that overflow on phones.
- `AppHeader` action rows wrap poorly; filter bars on list pages (Bookings, Invoices, Customers, Comms, Reports) sit in single horizontal rows.
- Preview confirms this at 767px on `/admin/users` — no sidebar, no way to navigate.

## Approach
Fix the shell first (unblocks navigation everywhere), then sweep pages in priority order. Semantic-token / Tailwind only — no business-logic changes.

### 1. Responsive app shell (highest impact, unblocks everything)
- Add a mobile top bar to `AdminLayout`, `PlatformLayout`, `CustomerLayout`: logo left, hamburger button right, tenant/user label center, visible only `< lg`.
- Convert `AppSidebar` into a dual-mode component:
  - `≥ lg`: current fixed rail (collapsed/expanded, unchanged).
  - `< lg`: slide-in drawer (Sheet from shadcn or a lightweight custom overlay) triggered by the hamburger. Auto-close on route change. Backdrop + focus trap + Esc.
- Ensure main content area gets correct top padding on mobile so the fixed top bar doesn't cover it.
- Persist behavior of `collapsed` state only for `lg+`.

### 2. AppHeader + page chrome
- Make `AppHeader` stack title/subtitle above actions on `< md`.
- Wrap action clusters with `flex-wrap gap-2`, allow buttons to shrink (icon-only fallback where a label is redundant).
- Filter bars on Bookings / Invoices / Customers / Comms / Reports / Users: switch to `grid grid-cols-1 sm:grid-cols-2 lg:auto-flow` layout; date-range pickers stack.

### 3. Data tables (Customers, Pets, Users, Invoices, Credit Notes, Payments, Comms, Reports)
- Wrap every `<table>` in `overflow-x-auto` with a subtle scroll shadow so it doesn't just clip.
- On `< md`, hide low-priority columns via `hidden md:table-cell` (keep name + primary status + a row-action).
- Row action menus: ensure they open as a dropdown, not a hover-only affordance.

### 4. Board / calendar / timeline views
- Bookings calendar week view, Grooming board, Hotel occupancy grid, Van timeline, Daycare board, Transport board: these are inherently wide. Wrap in `overflow-x-auto`, keep column widths, add a mobile hint ("swipe to see more days"). Do **not** try to reflow the grids — that would break the ops workflow.
- Ensure headers/legend/summary cards above the board stack on mobile.

### 5. Detail pages (Booking, Invoice, Credit Note, Customer, Pet)
- Two-column detail layouts → single column on `< lg`.
- Side panels (BookingCommsPanel, BookingInvoicePanel, CustomerCreditPanel) move below main content on mobile.
- Ensure long PDFs/iframes are `w-full` with `min-h` capped, not fixed pixel widths.

### 6. Modals & drawers
- Global rule: modals use `max-w-lg w-[calc(100vw-1.5rem)]` and `max-h-[calc(100vh-2rem)] overflow-y-auto`, drawers become full-width bottom sheets on `< sm`.
- Sweep: `NewBookingModal`, `BookingFormModal`, `BookingRequestFormModal`, `NewBookingRequestModal`, `CustomerFormModal`, `CustomerProfileModal`, `PetFormModal`, `MyPetFormModal`, `InviteUserModal`, `EditUserRolesDrawer`, `ResourceFormModal`, `ProductFormModal`, `StockAdjustmentDrawer`, `IssueCreditNoteDrawer`, `RecordPaymentDialog`, `RecordRefundDialog`, `ApplyCreditDialog`, `AllocateCreditDialog`, `CreditAdjustmentDialog`, `PayFastConnectDialog`, `EnrolmentDrawer`, `DaySwapDialog`, `NewInvoiceDrawer`, `CommsEventDrawer`.
- Their internal `grid-cols-2` field rows become `grid-cols-1 sm:grid-cols-2`.

### 7. Customer portal
- `CustomerDashboard`, `MyBookingsPage`, `MyBookingDetailPage`, `MyInvoicesPage/DetailPage`, `MyPaymentsPage`, `MyPetsPage/DetailPage`, `MyDocumentsPage`, `MyProfilePage`, `NewBookingRequestPage`: apply the same shell + table + card treatment. Customers are more likely to be on phones than staff, so verify each portal page individually.

### 8. Settings hub
- `SettingsIndexPage` grid: `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3`.
- All settings sub-pages (Branding, Comms, Email server, Invoicing, Retail, Payment methods/providers, Roles & permissions, Resources, Grooming packages/add-ons, Daycare plans/workflow/import, Hotel workflow, Transport workflow, Van workflow, Product categories, Stock locations, Vaccination rules, Message templates, Change password): stack forms to single column on `< md`, ensure Save button rows don't overflow.

### 9. Auth + public pages
- `Login`, `ForgotPassword`, `ResetPassword`, `AuthAccept`, `PublicIntakeForm`, `PublicInvoicePage`, `PayResultPages`: verify already-centered layouts scale to 320px width without horizontal scroll; tighten padding.

### 10. Verification pass
- Playwright script that walks the app at three viewports (375×812 mobile, 768×1024 tablet, 1440×900 desktop) and screenshots: login → admin dashboard → bookings → booking detail → customers → customer detail → invoices → invoice detail → settings index → 3 settings pages → customer portal dashboard → my bookings → my invoices.
- Check for: horizontal scroll on `<body>`, hidden nav, clipped modals, overflowing tables. Fix regressions found.

## Out of scope
- No new features, no data model or query changes.
- No visual redesign — palette, typography, spacing tokens unchanged. Purely responsive layout adjustments using existing design tokens.
- Wide ops boards (calendar, grooming, hotel, van, transport) stay horizontally scrollable rather than being redesigned into a mobile-first layout — that would change the workflow and is a separate project.

## Technical notes
- Reuse shadcn `Sheet` for the mobile nav drawer to avoid inventing new primitives.
- Add a shared `useIsBelowLg()` hook alongside the existing `useIsMobile()` for the sidebar breakpoint.
- Keep the sidebar `collapsed` localStorage keys unchanged; the mobile drawer state is ephemeral (not persisted).
- Because the sweep touches ~80 files, work in commits by area (shell → tables → boards → modals → portal → settings → verify) so each step is reviewable.

## Deliverable
Every page from `/login` through `/admin/*`, `/platform/*`, `/portal/*` is usable at 375px, 768px, and 1440px — nav reachable, no accidental horizontal scroll on `<body>`, modals fit, forms stack cleanly. Verified via Playwright screenshots.
