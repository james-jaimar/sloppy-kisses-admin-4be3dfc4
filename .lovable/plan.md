# Stop-and-check: real-world gaps worth closing

Findings below were confirmed by reading the schema and the code, not assumed. They are grouped by how much pain they cause on an ordinary week.

## Tier 1 — settings that exist but do nothing

These are already switches on the Settings screens, so staff will believe they are live. Nothing in the app or database reads them today:

- **Hotel deposit %** and **balance due X days before arrival** — hotel invoices are raised in full at booking; no deposit invoice, no balance reminder.
- **Cancellation fees** — grooming has a fee % and notice window, hotel has a cutoff and amendment fee. Cancelling (admin or portal) charges nothing; the portal only says "a fee may apply".
- **Overdue interest % per month** — never applied to a late invoice.
- **Daycare notice period (months)** and **catch-up window (days)** — ending an enrolment does not check notice or bill the notice month; missed days can never be caught up.
- **Free amendments count** — reschedules are unlimited and free.

Plan: make each one actually fire — a deposit/balance split on hotel invoices, a cancellation-fee line raised on cancel (with a staff "waive fee" override), an interest line on the ageing run, a notice-period warning plus final invoice when an enrolment ends, and an amendment counter per booking.

## Tier 2 — the calendar does not know the business ever closes

There is no closures or public-holidays table anywhere. Consequences today:

- Pro-rata and monthly daycare billing count public holidays as attendance days, so customers pay for days the gate is shut.
- Boards, availability and the portal will happily take a booking on Christmas Day.

Plan: a `closures` table (date range, which services, bill/don't-bill flag) with a Settings CRUD screen, seeded with SA public holidays, wired into daycare day counting, hotel/grooming availability and portal booking validation.

## Tier 3 — daily front-desk realities with nowhere to go

- **Waitlist.** When a hotel day or grooming slot is full there is no way to record "call me if something opens". Staff will keep this on paper.
- **No-show.** The status exists and has never been used once. There is no rule for what a no-show costs or which invoice it lands on.
- **Daycare capacity is decorative.** The board displays the daily capacity, but nothing stops enrolments, day-swaps or walk-ins exceeding it — hotel already blocks properly, daycare should match.
- **Multi-pet households.** Enrolment is one row per pet, so a family with three dogs is three enrolments and three separate pro-rata lines.
- **Pausing, not ending.** Owners go away for a month. Today an enrolment is only active or ended — no pause that skips billing but keeps the place.
- **Medication and feeding for hotel guests** are one free-text box, not a schedule staff tick off during rounds like the other checklists.
- **Price increases.** Rate cards have no "effective from" date, so an annual increase must be typed on the morning it starts.

## Tier 4 — money housekeeping

- **Dunning never stops.** Reminders keep going to customers who have agreed a payment arrangement; there is no "on hold" flag on a customer or invoice.
- **Credit on account** has no expiry or write-off path for dormant customers.
- **Gift vouchers and prepaid grooming bundles** (buy 5, get 1 free) — nothing in the system, and a common pet-care revenue line.
- **Tips for groomers** — no field, so cash tips stay invisible.

## Tier 5 — people, not pets

- No staff roster, shift or leave record, so the boards cannot show that Thursday has one groomer instead of two, and Work Mode cannot warn about an unstaffed van run.

## Suggested order

1. Tier 1 — settings that lie are the biggest trust risk, and each item is small.
2. Closures/public holidays — it corrupts billing maths every December and April.
3. Daycare capacity enforcement, no-show handling, enrolment pause.
4. Waitlist, prepaid bundles/vouchers, medication schedules.
5. Staff roster.

## Technical notes

- New tables: `closures`, `waitlist_entries`, `booking_amendments`, `prepaid_packs` + `prepaid_pack_uses`, `staff_shifts`; new columns for enrolment pause (`paused_from`/`paused_to`) and customer/invoice `collections_hold`.
- Fee lines reuse the existing `invoice_items.source_type` pattern (`cancellation_fee`, `no_show_fee`, `late_interest`) so they stay idempotent and traceable, raised by DB functions in the same style as `ensure_daycare_prorata_invoice`.
- Closure-awareness plugs into `daycare_prorata_quote`, `generate_monthly_daycare_invoices`, `hotel_day_availability` and `grooming_day_availability` rather than into the UI.
- Every item ships with its Settings CRUD screen and permission code, per the settings-first rule.