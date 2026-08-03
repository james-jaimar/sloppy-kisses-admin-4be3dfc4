# Mid-month daycare joiners: pro-rata first invoice

## What happens today

- An enrolment created mid-month raises **no invoice at all** for the rest of that month — the auto-invoice trigger was removed when we moved daycare to the monthly run.
- The monthly run bills **the full plan price** for every active enrolment, with no awareness of a start date part-way through the period.

So a dog starting on the 12th attends for free until the 1st, and then pays a full month.

## What changes

**1. Pro-rata by remaining days**

When an enrolment starts after the 1st of a month, the partial month is charged as:

```text
plan price  x  (attendance days from start date to month end)
               ---------------------------------------------
               (attendance days in the whole month)
```

"Attendance days" means the weekdays actually selected on the enrolment (Mon/Wed/Fri enrolment counts only Mon/Wed/Fri dates), so a customer joining before their busy week is charged fairly. Public holidays are not modelled and are counted as normal days. The result is rounded to 2 decimals, and a zero/negative result raises no invoice.

**2. Invoiced immediately on enrolment**

Saving a mid-month enrolment creates its **own issued invoice** for just that partial period, with the standard due date from invoicing settings, and emails it to the customer (subject to the global send kill-switch). The line reads e.g. `Daycare — 3 Days (Bella) — pro-rata 12–31 Aug 2026 (6 of 13 days)`.

Enrolments that start on the 1st behave exactly as today: nothing at enrolment, billed by the monthly run.

**3. Monthly run skips already-billed partial periods**

The run continues to bill full months from the 1st. It will not re-bill a period already covered by a pro-rata invoice, and a mid-month enrolment's first full month is the next month.

**4. Leaving mid-month**

No change and no refund — the month already invoiced stands, and notice-period rules apply as they do now.

## Settings

Invoicing settings gain one switch: **Pro-rata mid-month daycare enrolments** (on by default) with an option to bill mid-month joiners a full month instead. This keeps the settings-first rule and lets Charlotte turn it off without a developer.

## What the user sees

- Enrolment drawer: when the start date is not the 1st, a live line under the date shows "Pro-rata: 6 of 13 days — R415.38 invoiced now". The success toast changes from "billed on the next monthly run" to "pro-rata invoice issued and emailed".
- The customer gets a normal issued invoice in the portal, payable online, and the next month's invoice arrives on the usual monthly run.

## Technical notes

- New DB function `daycare_prorata_amount(enrolment_id)` returning the day counts and amount, and `ensure_daycare_prorata_invoice(enrolment_id)` which creates a standalone `issued` invoice with `billing_period_start` = start date, `billing_period_end` = month end, and one `invoice_items` row with `source_type = 'daycare_enrolment_prorata'`, `source_id = enrolment_id` (unique, so re-saving cannot double-bill).
- Trigger on `daycare_enrolments` insert (and on start-date change while the invoice is still unsent) calls it, gated by the new `invoicing_settings.daycare_prorata_enabled` flag.
- `generate_monthly_daycare_invoices` gets a guard excluding enrolments whose pro-rata invoice already covers the requested period.
- Frontend: pro-rata preview in `EnrolmentDrawer.tsx` (client-side mirror of the same day count), auto-email via the existing `autoEmailBookingInvoice`-style helper in `src/features/invoices/autoEmail.ts`, and the new toggle in `InvoicingSettingsPage.tsx`.
