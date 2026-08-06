# Fix customer search across booking, quote and payment screens

## What's happening

Customer pickers were built separately on each screen, so they behave differently:

- **New quote** (`NewQuoteDrawer`): a small search box sits above a **native dropdown list**. If you click the dropdown and start typing, nothing useful happens — the dropdown only holds the first 20 customers alphabetically, and native dropdowns don't search. You have to type in the box above it first.
- **New booking** (`BookingFormModal`): a proper search-as-you-type list, but a different look and behaviour to everything else.
- **Quick sale**, **Take payment**, **Daycare enrolment**: three more variants, each with their own search rules and result limits (10 / 20 / 25 rows).

I have not yet reproduced the exact "nothing happens" moment on a live signed-in screen (this project's preview can't be signed into from my side), so step 1 is to confirm the behaviour per screen before changing it.

## Plan

1. **Reproduce and confirm** — walk each screen (New booking, New quote, Quick sale, Take payment, Daycare enrolment, Walk-in) and record exactly what search does today, including any query errors.
2. **Build one shared customer picker** — a single searchable component: click it, type, get live results (name, customer number, email/mobile), select one, "Change" to swap. Shows "Searching…", "No customers found", and a hint to keep typing when there are more matches than shown.
3. **Roll it out** to New quote, New booking, Quick sale, Take payment and Daycare enrolment (enrolment keeps its customer+pet grouping, powered by the same search).
4. **Make search consistent** — matches first name, surname, full name, customer number, email and mobile; multi-word terms ("tracy will") must all match; debounced; consistent result count.
5. **Verify** — re-check each screen and confirm a known customer is findable by name, number and email.

## Technical notes

- New `src/components/customers/CustomerCombobox.tsx` wrapping the existing `useCustomers` hook (shared debounce + result cap).
- Replaces: native `<select>` in `NewQuoteDrawer.tsx`, the inline list in `BookingFormModal.tsx`, the inline search in `QuickSalePage.tsx`, the bespoke `useCustomerSearch` in `TakePaymentDialog.tsx`.
- `EnrolmentDrawer.tsx` keeps its pet-grouped popover but moves onto the shared search query.
- No schema or RLS changes; presentation and query-shape only.