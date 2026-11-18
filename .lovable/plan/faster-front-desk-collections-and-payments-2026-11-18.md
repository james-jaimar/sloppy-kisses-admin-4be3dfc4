# Faster front-desk collections and payments

## Result
Staff can recognise the customer and pet, see what is outstanding, and take payment without leaving their working screen. Build all three improvements as one connected experience, delivered in three sequential slices.

**Example:** Kerry opens the grooming booking → sees the customer, dog and “Outstanding R…” → taps **Take payment** → records it using the existing payment-method buttons → returns to the same booking with its updated balance. If staff only know the customer or dog's name, search brings them into that same experience.

## Shared approach across all three slices
- One definition of invoice/payment state, reused by booking panels, search, customer profiles and grooming cards. No competing balance calculations.
- Clearly distinguish **this visit's invoices** from **other outstanding invoices on the customer's account**. A shared invoice can cover several visits: show its actual balance, not an invented per-dog debt, and count each invoice once.
- Separate financial state from operational readiness. Paid does not mean the dog is ready; ready does not mean paid. Neither automatically checks the dog out.
- Missing, draft, cancelled and failed-to-load invoices must never appear as “Paid” or “Nothing outstanding”. Use explicit states and retry where needed.
- Reuse the existing payment recording, allocation, credit, receipts and accounting workflows. These slices improve access and presentation; they do not introduce a new financial write path.
- After payment, refresh every affected invoice, customer total, booking summary, search result and board indicator, including all invoices receiving an allocation.
- Respect existing invoice-view and payment-record permissions and tenant boundaries. No financial information for staff who cannot view invoices.
- Keep configured payment methods and operational rules in their existing Settings screens. No new fixed rates, workflow columns or permission system.
- Yoco remains explicitly **manual card recording** until the separate approved terminal-integration work is available. This plan does not activate terminal charging.

## Slice 1 — payment at the booking
**Staff experience**
- Put customer/pet identification and a compact payment summary near the top of the shared booking side panel, before lengthy service details.
- Show linked invoice number, status, actual remaining balance and a clear **Take payment** action for payable issued invoices.
- Open the existing payment dialog with the correct customer, invoice and remaining amount already selected. No need to find the invoice again.
- Keep the panel and original board position underneath. Cancelling returns there unchanged; a successful payment updates the displayed balance without leaving the board.
- When more than one payable invoice is linked, present a short invoice list rather than silently choosing one. Offer other customer balances separately, without replacing the visit's amount with the account total.
- Show drafts as not yet issued, paid invoices as paid, and unavailable data as unavailable. Do not create or issue an invoice from this shortcut; hotel confirmation and scheduled grooming release remain authoritative.
- Reuse this payment presentation/action in the existing booking invoice panel so the full booking page and side panel agree.

**Dependency work delivered here**
- Establish the shared booking-invoice resolution, payment-state presentation and refresh behaviour that slices 2 and 3 consume.
- Resolve both direct booking invoice links and invoice-item booking links; deduplicate invoice IDs. The current side-panel invoice query and board indicators use different link paths, so their results must be reconciled before reuse.
- Ensure the payment dialog appears above the side panel, with clear invoice/customer identity and safe loading/error states.

**Verification gate**
- Open an existing grooming booking, confirm its persisted invoice/balance, record a partial payment, then read back the smaller balance through the same panel and invoice screen.
- Repeat for a fully settled visit, multiple linked invoices, a shared invoice, no invoice and a scheduled draft; preserve hotel no-invoice-before-confirmation behaviour.
- Test cancellation, failed saving, multi-invoice allocation and restricted staff access. Verify that selecting Yoco does not charge the terminal.
- Check desktop and phone/tablet presentation and dialog layering; run focused payment/link/state regressions.

## Slice 2 — find the person and act immediately
**Staff experience**
- Enhance global search results with recognisable customer and pet context: customer name/number and pet names, service/date for visits, and outstanding amounts where permitted.
- Searching by customer or pet name should surface relevant visits, not require a booking number. Prioritise today's relevant visits, while keeping older results identifiable and accessible.
- Clicking a booking result opens the same side panel from slice 1; staff keep their underlying screen. Customer and pet results retain their normal destinations, with clear visit/payment actions where relevant.
- Put an outstanding-invoice total, invoice count and **Take payment** shortcut near the top of the customer profile, without needing the Invoices tab.
- Preselect the customer in the existing Take Payment dialog. With one payable invoice, go directly to payment; with several, show the short chooser so staff deliberately select the invoice.
- Label this as the customer's outstanding invoices, not the price of today's grooming. Show available customer credit separately where permitted; do not silently net or allocate it.

**Integration with slice 1**
- Use the shared invoice eligibility and balance states established in slice 1, and the same payment dialog/action.
- Refresh profile totals and search balances after any payment/allocation. Keep the booking panel as the common visit workspace rather than building another payment screen.
- Load enrichment only for matched customers/pets/visits, in bounded batches; avoid a whole-customer-database balance scan or a separate query per search result.

**Verification gate**
- Find an existing customer by name, number and mobile; find their visit by dog name. Confirm the displayed identity and amount against persisted invoices.
- Exercise search → booking panel → payment and customer profile → preselected payment; verify updated balances on both paths.
- Test same-name customers/pets, no matching visit, no outstanding invoices, multiple invoices, unavailable financial data and invoice-view/payment permission differences.
- Check keyboard selection, modified-click navigation where supported, loading/error states and desktop/mobile layouts; run focused search and customer-summary rule tests.

## Slice 3 — grooming collection status at a glance
**Staff experience**
- Make Ready-column grooming cards clearly show pet, owner, operational readiness and payment state together.
- Show **Ready · Paid** when linked issued invoices are settled, or **Ready · Outstanding R…** when payment remains. Clearly identify draft/no-invoice/unavailable states instead of implying all is settled.
- When a shared invoice covers several visits, identify the outstanding amount as an invoice balance so staff do not collect the full amount repeatedly for each pet.
- Card clicks continue to open the slice 1 panel; payment stays there. No extra invoice-page detour or new collection page.
- Preserve the existing daycare return indication: a dog returning to daycare must not be labelled as waiting for customer collection merely because grooming is ready.
- Keep existing drag/drop, workflow states, health checks, Stay & Play and collection actions unchanged. Payment does not automatically complete or release the booking.

**Integration with slices 1 and 2**
- Reuse the shared invoice resolution/state rather than extending the existing independent “worst status wins” calculation with another balance interpretation.
- Fetch payment information once for the board's booking set. Refresh all affected cards after payments, including shared invoices and payments allocated across several invoices.
- Confirm that the same invoice reads identically on the Ready card, booking panel, search and customer profile, with visit/account labels retaining their distinct meanings.

**Verification gate**
- Walk the complete collection scenario: find a Ready dog → open booking → record partial/full payment → return to the same board → confirm the card and search/profile summaries update.
- Repeat for paid, shared-invoice, multi-pet, draft/unissued, unavailable-data and daycare-return bookings; verify readiness and payment remain independent.
- Run shared-state regressions and check desktop/mobile cards, wrapping, colour contrast, board navigation and preserved drag/drop.

## Technical implementation
- Extend the existing React/TanStack Query patterns: `BookingPeek`, `BookingDetailPanel`, `BookingInvoicePanel`, invoice queries and payment dialogs, `useGlobalSearch`/`GlobalSearch`, `CustomerDetailPage`, and shared payment flags used by `GroomingCard`.
- Establish small shared invoice-resolution/state helpers and tenant-scoped batched read hooks; derive financial eligibility from the existing invoice status/balance rules, not UI colour or booking status.
- Return explicit loading/error/empty states from shared reads. Add tenant predicates to booking/invoice lookup paths and gate financial reads/actions using the existing permission codes.
- Extend payment mutation invalidation to cover booking invoice reads, board payment flags, matched search results, account summaries and every allocated invoice; include relevant existing credit/account query keys where affected.
- Use existing Button/dialog components, semantic theme tokens and a body-level portal for payment dialogs above the booking panel. Do not add decorative nested cards or unrelated screen redesigns.
- Start with frontend/shared reads. No new database tables, financial mutations, notification types or Settings capability are planned. If a required read cannot be safely expressed through existing tenant-scoped access, investigate first and apply Supabase grants/RLS guidance before proposing any database change.
- Add concrete rule tests beside existing tests for invoice-link deduplication, payable/draft/missing/error states, distinct visit/account totals, refresh targets and readiness independence. Do not test cosmetic copy or snapshots.

## Delivery order and completion standard
1. Approve this combined plan, then implement and verify slice 1.
2. Carry its shared foundations into slice 2; complete and verify it before starting slice 3.
3. Complete slice 3, then perform the cross-screen collection walkthrough.

Proceed between slices without routine reconfirmation. Fix issues found in the shared foundations before building the next slice. Record completion and exact outstanding checks in the roadmap.

A successful compile or a mocked payment is not a live collection test. Authenticated end-to-end checks have previously been unavailable on this external Supabase connection; reassess when implementing. If still unavailable, complete the safe source/test work, explicitly mark real staff payment/readback verification blocked, and do not claim that slice fully verified. Yoco approval and physical-terminal tests remain separate dependencies, not prerequisites for these manual-payment improvements.

## Out of scope
New collections dashboard, automatic checkout, changed invoice release/approval policies, automated Yoco charging, new payment defaults, bulk account settlement without invoice selection, new financial calculations and unrelated front-desk improvements.
