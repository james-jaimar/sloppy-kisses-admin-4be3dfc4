## Improve New Enrolment pet picker

Replace the single native `<select>` for Pet in `src/features/daycare/EnrolmentDrawer.tsx` with a searchable Customer + Pet combobox.

### UX
- Two-step combobox in a popover (shadcn `Command`):
  1. **Search field** — one input that matches against customer name, customer number (SK####), customer email, and pet name.
  2. **Results list** grouped by customer:
     - Header row: `Tracy Williams — SK04292` (muted, non-selectable)
     - Under it, one selectable row per pet: `Jackson · Staffie` / `Abby · Poodle`
- Selecting a pet row sets `petId` (and internally we already resolve `customer_id` from the pet). Selected state shows as `Jackson — Tracy Williams (SK04292)` in the trigger button.
- Empty state: "No matching customer or pet".
- Keep the field disabled when editing an existing enrolment (same as today).

### Data
- Reuse the existing `useTenantPetsWithOwners(tenantId)` query — it already returns pets with `customer { full_name, customer_number, email }`. No new query needed.
- Client-side filter (list is bounded per tenant); no debounce required.

### Scope
- Only `EnrolmentDrawer.tsx` changes. Plan, dates, weekdays, notes, Active toggle, and save logic stay identical.
- No schema, no backend, no other screens touched.
