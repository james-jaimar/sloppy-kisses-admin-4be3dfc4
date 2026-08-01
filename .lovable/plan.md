## Goal

Two presentation-only fixes in the customer portal: remove the admin-only top bar, and get rid of the dollar-sign iconography in a rand business.

## 1. Portal header

`src/components/layout/AppHeader.tsx` is shared by admin, platform and portal pages (14 portal screens use it). Today it always renders the admin utility bar: search field, "Quick add" dropdown, Sys Dev link, messages icon, bell icon, user menu.

Change: `AppHeader` detects a portal context (route starts with `/customer`) and renders a **minimal** top bar containing only the user chip — avatar, name, role line — with the existing dropdown (email, Change password → `/customer/profile/password`, Sign out). No search, no Quick add, no message/bell icons, no Sys Dev link.

The title / subtitle / tabs / actions row below is unchanged, so every portal page keeps its heading and buttons.

Note on why Quick add did nothing: `QuickAddProvider` is only mounted in `AdminLayout`, so in the portal `useQuickAdd()` falls back to a no-op. Removing the button from the portal resolves it; admin behaviour is untouched.

## 2. Dollar-sign icons

Amounts already render as `R 1 234.56` via `fmtZar`. The "$" the user sees is the lucide `Receipt` glyph, which draws a dollar sign inside the receipt.

Replace `Receipt` with `ReceiptText` (same shape, text lines instead of `$`) in:
- `src/constants/navigation.ts` — the customer **Invoices** sidebar item (and the admin "Invoices & Payments" item, for consistency)
- `src/features/customerPortal/CustomerDashboard.tsx` — outstanding-invoice tiles and list rows

Also swap the portal **Payments** sidebar icon `CreditCard` (no currency glyph, but worth a check) only if it reads as a dollar; otherwise leave it.

Sweep the rest of the portal for any other lucide icon carrying a `$` (`DollarSign`, `Banknote`, `CircleDollarSign`, `Receipt`) and replace with rand-neutral equivalents.

## Out of scope

- Admin header keeps its search, Quick add, messages and bell exactly as-is.
- No changes to invoice data, currency formatting, or business logic.
