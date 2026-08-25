# Fix till sales blocked by invoice security

## Confirmed cause

The till currently creates the invoice, invoice lines, stock movements and payments directly from the browser. The live `invoices` INSERT policy requires `invoices.create`, while the Shop Staff role intentionally has only `pos.operate`, product/photo access, stock viewing and optional barcode linking. Therefore the first invoice INSERT is rejected for both a named customer and the walk-in customer; customer selection is not the cause.

## Implementation

1. Add one authenticated, atomic database function for completing a POS sale.
   - Require active tenant membership and `pos.operate` before doing anything.
   - Validate that the customer, stock location and every product belong to the same tenant.
   - Validate quantities, prices, discount and tender totals server-side.
   - In one transaction, allocate the invoice number, create the draft retail invoice, create invoice items and linked stock movements, issue the invoice, record each tender, and return the receipt totals.
   - Keep charge-to-account sales open when there are no tenders; fully paid sales continue through the existing payment recomputation and Xero/event triggers.
   - Restrict function execution to `authenticated`; do not grant Shop Staff general invoice or payment permissions and do not weaken existing RLS policies.

2. Switch the till mutation to call that POS function once instead of performing a chain of browser-side inserts and updates.
   - Preserve the current tender dialog, split payments, discounts, customer selection, receipt and error feedback.
   - Pass only the sale payload required by the function and use its returned invoice/paid/change values.
   - This also prevents half-created invoices or stock movements if any later step fails.

3. Verify the complete paths with the Shop Staff permission set.
   - Walk-in cash/card sale.
   - Named-customer cash/card sale.
   - Named-customer charge-to-account sale.
   - Split tender and discount.
   - Confirm one invoice, correct lines, corresponding stock deductions, correct payments/status, and no orphan rows after a deliberately invalid request.

## Technical scope

- Database migration: new `SECURITY DEFINER` POS completion function with `search_path = public`, explicit permission and tenant checks, authenticated-only execution, and no changes to reserved schemas.
- Frontend: replace the multi-write implementation in the existing POS sale mutation with the new RPC.
- No changes to the general invoicing permissions, Shop Staff sidebar, customer records, or Quick Sale screen.
