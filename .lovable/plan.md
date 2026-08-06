# Hotel: one invoice, pre-arrival reminders, VAT-inclusive rates, Xero visibility

## 1. One invoice per hotel stay (replaces the deposit/balance pair)

Today a hotel booking creates two invoices: a deposit invoice and a balance invoice carrying a
"Less deposit already invoiced" credit line. That goes away.

- A hotel booking creates **one issued invoice** for the full stay total.
- The invoice records a **deposit amount due now** (50%, from Policy Settings) purely as an
  amount to collect — not a second document.
- Portal money strip keeps both buttons: **Pay 50% deposit now** and **Pay in full**. Paying the
  deposit records a real payment against the single invoice, which becomes **part paid** with the
  remainder outstanding.
- The invoice due date stays as it is today: the configured number of days before arrival, so the
  balance is due before the stay.
- Admin booking detail shows the same strip: total, deposit paid/unpaid, balance outstanding,
  "arrival cleared" state.
- Deposit offset lines and the deposit-invoice concept are removed from the hotel flow.

## 2. Balance reminders before the stay

Reminders currently only fire **after** an invoice is overdue, and only for invoices already
emailed. Hotel balances need chasing before arrival instead.

- Add pre-arrival reminders at **3, 2 and 1 days before the check-in date** for any hotel invoice
  with an outstanding balance.
- Each offset sends once; paying in full stops the sequence; a booking cancelled or the customer on
  collections hold is skipped.
- The days (3/2/1) are a Policy Settings field, not hardcoded, so Charlotte can change them.
- Reminders go through the existing email pipeline and respect the global send lock and the
  customer's email preference, and appear in the Comms inbox like every other message.

## 3. Rates are VAT-inclusive

Confirmed on INV00243: a 6-night stay at R560/night prices at R3 360 and then adds 15% VAT on top,
giving R3 864 — more than the published price.

- Switch invoicing to **VAT-inclusive**: R3 360 is the total, with VAT of R438,26 shown inside it.
- Applies to hotel, grooming, daycare and retail lines alike, so quotes, invoices, statements, the
  VAT report and Xero all agree.
- Existing unpaid test invoices are recalculated; historic paid invoices are left untouched.

## 4. Xero auto-sync

Checked the live data: auto-sync **is** running. INV00243 and INV00244 were created at 08:06 and
pushed to Xero at 08:10. The queue drains every 5 minutes, which is why it looks like nothing
happened right after creating an invoice.

- **Push immediately on issue/payment** rather than waiting for the 5-minute sweep, so an invoice
  lands in Xero within seconds. The sweep stays as the safety net for retries.
- **Surface failures.** One invoice (INV00242, the R0 hotel invoice) is stuck as failed: it was
  pushed to Xero while zero-value, Xero authorised it, and Xero refuses further modification. Show
  a "Xero sync failed" badge on the invoice and a failed-items panel on the Xero settings page with
  the error and a retry button, instead of it sitting silently in a queue table.
- Skip pushing zero-value invoices so this cannot recur.

## 5. Test data cleanup

- Remove the extra deposit invoices from the test hotel bookings (INV00244 and its siblings) and
  rebuild those bookings on the single-invoice model with VAT-inclusive totals.
- Leave the stuck INV00242 record marked as a Xero failure so the new failure UI can be verified,
  then void it.

## Technical notes
- `sync_hotel_deposit_invoice()` is replaced by a deposit-amount column on `invoices`
  (`deposit_due`, `deposit_due_date`); `hotel_pay_in_full` and the offset item logic are dropped.
- `HotelMoneyStrip.tsx` reads one invoice plus its deposit fields; deposit checkout is a normal
  PayFast checkout for a partial amount against the single invoice.
- Pre-arrival reminders: extend `send-invoice-reminders` with a booking-date branch (join
  `bookings.start_date`), tracked via a new `last_prearrival_offset` column, alongside the existing
  overdue offsets.
- VAT: flip `invoicing_settings.prices_include_vat` to true and change `invoice_items_compute()`
  to back out VAT from the line total rather than add it; Xero already posts `Inclusive`.
- Xero immediate push: have `xero_queue_invoice`/`xero_queue_payment` fire `xero_drain_queue()` for
  that tenant right away rather than only on cron.
