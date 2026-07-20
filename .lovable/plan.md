## Problem
Actions like "Email invoice" and dozens of destructive/confirm actions use the browser's native `window.confirm()` popup. It's ugly, shows the raw Lovable preview hostname, and doesn't match the app's design.

## Plan

### 1. Add a shared confirm primitive
Create `src/components/ui/confirm-dialog.tsx` built on the existing shadcn `AlertDialog`:
- Component: `<ConfirmDialog open onOpenChange title description confirmLabel cancelLabel tone={"default"|"destructive"|"primary"} onConfirm loading />`
- Imperative helper: `const confirm = useConfirm();` returning `await confirm({ title, description, ... }) : boolean`, backed by a single provider mounted once in `App.tsx`. This lets us convert existing `if (!confirm(...)) return;` call sites with a one-line change (`if (!(await confirm({...}))) return;`) instead of restructuring every handler into JSX state.
- Styled with app tokens (coral primary, destructive variant for deletes/voids), rounded, matches modals used elsewhere.

### 2. Mount the provider
Wrap the app tree in `src/App.tsx` with `<ConfirmProvider>` so `useConfirm()` is available everywhere.

### 3. Replace every native call site
Convert all 30 `confirm()` / `window.confirm()` usages found across:
- Invoices: `InvoiceDetailPage` (email send, void, remove line, void refund) — this is the one in the screenshot
- Credit notes: `CreditNoteDetailPage` (issue, void, remove line, reverse application)
- Bookings: `BookingDetailPage`, `BookingDetailPanel`, `BookingFormModal`
- Customers/Pets: `CustomerDetailPage`, `PetDetailPage`, `PetVaccinationsPanel`, `NotesTab`
- Daycare/Hotel/Grooming: `EnrolmentsPage`, `TodayPanel`, `GroomingBoard`
- Settings: `MessageTemplatesPage`, `VaccinationRulesPage`, `StockLocationsPage`, `GroomingPackagesPage`, `GroomingAddonsPage`, `DaycarePlansPage`, `PaymentMethodsPage`, `ProductCategoriesPage`, `ResourcesPage`, `RolesPermissionsPage`
- Users/Platform: `UsersPage`, `FeatureFlagsPage`

Each call becomes an `await confirm({...})` with appropriate title/description/tone. Destructive actions (delete, void, remove) get `tone="destructive"` (red confirm button); neutral actions (email invoice, issue) get `tone="primary"` (coral).

### 4. Not in scope
No changes to business logic, mutations, or backend — purely the confirmation UI layer.

## Verification
- Build passes
- Manually trigger the "Send" button on an invoice — branded dialog appears instead of the native popup
- Spot-check one destructive action (e.g. delete enrolment) shows the red variant
