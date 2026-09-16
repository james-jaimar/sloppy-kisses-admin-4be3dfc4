# Till: sell to an existing client and add it to their open invoice

Most shop sales are daycare, hotel and grooming clients collecting their dog. The till should let reception find that client, see what they already owe, and add the shop items onto that same bill instead of ringing up a separate sale.

## 1. A proper full-screen customer panel

Today the "Attach a customer" pop-up is a small centred box. It becomes a large panel — roughly 85% of the screen, with the search field focused on open — split into two halves:

- **Left: find the person.** Search by name, mobile, email or pet name; results show the name, mobile and their pets, so "James with Bella" is unmistakable. A **Walk-in (cash)** button stays at the bottom for anonymous sales.
- **Right: what's happening with them.** Once a person is selected:
  - Their **open invoices** — number, what it's for (grooming, hotel, daycare), date and balance due, with a **Add sale to this invoice** button on each.
  - **Today's bookings** for that customer (e.g. "Full groom — Bella — collecting today") as a sanity check that reception has the right person.
  - **Start a new sale for this customer** for when nothing is outstanding.

## 2. Two ways to finish a sale

The current sale panel gains a small banner showing which mode the till is in:

- **New sale** (today's behaviour) — a fresh invoice is created, paid at the till or charged to account.
- **Adding to invoice INV-0123** — the shop items are appended as extra lines on that existing invoice. The panel then shows:
  - Already on that invoice: R x
  - Shop items now: R y
  - **New total to pay: R x + y**

  and the big button reads **Add to invoice & take payment R (new total)** with an **Add to invoice only** option if the customer will pay later.

Reception can therefore turn the tablet around and show the customer one final figure covering the groom plus the dog food and chews.

## 3. Payment

Payment against a combined invoice goes through the existing take-payment flow (cash, card, Yoko, EFT, split), settling the whole outstanding balance — or a part payment if that's what's handed over. The receipt shows the full invoice: service lines plus shop lines, what was paid and any change.

## 4. Safety rails

- Only invoices that are still open and editable can be added to. Invoices already marked sent, part paid, paid or cancelled are shown read-only with a note ("already sent to the customer — ring this up as a separate sale"), so the customer is never surprised by a bill changing after they got it.
- Stock still moves off the shelf per item, exactly as it does now, whichever route is used.
- If the invoice changes after the customer had already received it, no automatic email goes out — reception hands them the printed receipt.

## Technical notes

- `PosPage.tsx`: replace the small `Overlay` for the customer picker with a new `CustomerSalePanel.tsx` (`max-w-6xl`, `h-[85vh]`, two-column) reusing `CustomerCombobox` for search, `useCustomerOpenInvoices` for balances and a small bookings-today query.
- New till state `attachInvoiceId`, threaded into `PosSalePanel` for the banner/totals and into the charge action.
- Database: extend `public.complete_pos_sale` with `p_invoice_id uuid default null`. When supplied it validates the invoice belongs to the tenant + customer and is not locked (`_invoice_locked` currently covers sent/part_paid/paid/overdue/cancelled — `issued` and `draft` remain editable, which is the common grooming case), then appends `invoice_items` with continuing `sort_order` and records the stock movements against that invoice instead of creating a new one. Tenders allocate against the invoice's full balance.
- Return shape stays the same so `ReceiptView` works unchanged; receipt rendering reads the invoice's full line set when attaching.
- Permissions unchanged: `pos.operate` plus existing tenant access.

## Build order

1. Big customer panel: search, open invoices, today's bookings, walk-in fallback.
2. `complete_pos_sale` accepting an existing invoice, with the locking checks.
3. Till banner, combined totals, "add to invoice & take payment" / "add only".
4. Receipt showing the combined invoice.
