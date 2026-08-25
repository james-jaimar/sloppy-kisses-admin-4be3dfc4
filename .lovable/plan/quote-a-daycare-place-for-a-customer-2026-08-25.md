# Quote a daycare place for a customer

Today the quote builder only knows hotel and cattery: it prices nights from the hotel rate cards, and accepting a quote creates a hotel booking. Daycare has pricing logic (monthly plan price plus the mid-month pro-rata already shown inside New enrolment) but no way to send the customer a price before they commit.

This adds daycare as a first-class quote type: front desk builds it, the customer gets the same branded quote email/PDF and accept link, and accepting creates the enrolment.

## What front desk will do

1. Open **New quote** (Quotes list, Quick add, the Daycare page, or the customer's record) and choose **Daycare** as the service.
2. Pick the customer and pet(s), the plan (2/3/5 days a week etc.), the weekdays, and a start date.
3. The quote prices itself:
   - **First month (pro-rata)** — plan price x attendance days remaining / attendance days in the month, using the same maths as New enrolment. Skipped when the start date is the 1st.
   - **Monthly from <next month>** — the ongoing plan price, marked as recurring so the customer sees what they pay each month rather than a one-off charge.
   - If daycare settings require an assessment day, an assessment line is added with a "waive" toggle, matching the enrolment rules.
4. Send it — same email template, PDF, validity/expiry and public accept link as hotel quotes.

## What the customer sees

The quote page and email show the plan, days per week, chosen weekdays, start date, the pro-rata first charge and the monthly amount from the following month. **Accept** creates the daycare enrolment (active, with the plan, weekdays, start date and assessment waiver from the quote) and lands the first pro-rata invoice exactly as creating an enrolment by hand does. The quote is stamped accepted and linked to the enrolment.

## New entry points

- **Quotes → New quote**: service picker gains Daycare (existing hotel/cattery flow untouched).
- **Daycare page**: a **Quote** button beside Walk-in and New enrolment, pre-set to daycare.
- **Customer 360**: "New quote" action on the customer's record with the customer pre-filled.

## Technical notes

- `estimates` gains no new columns: the plan id, weekday list, start date and assessment waiver ride in `extras` (alongside the existing `pets`/`surcharges` shape); `service_type` is `daycare`.
- New DB work, in one migration:
  - `accept_estimate` branches on `service_type`: `daycare` calls a new `accept_daycare_estimate(estimate_id)` that inserts the `daycare_enrolments` row(s) (one per pet) from `extras`, lets the existing pro-rata invoice trigger fire, and links `estimates.booking_id`/a new `estimates.enrolment_id` back. Hotel path unchanged.
  - `accept_public_quote` returns the enrolment plus the pro-rata invoice token so the public page can show "pay your first month".
- `NewQuoteDrawer` splits into a shared shell plus per-service panels (`HotelQuotePanel`, new `DaycareQuotePanel`) so the hotel logic stays as it is. The daycare panel reuses `prorataQuote()` from `src/features/daycare/prorata.ts` and the daycare plan/settings queries.
- Quote detail, PDF and email renderers already loop over `estimate_items`, so they need only daycare-aware header text (plan/days instead of accommodation/nights) and to label the monthly line as recurring.
- Quote list filters and the portal "My quotes" screen pick up daycare automatically via `SERVICE_LABEL`.
- Permission gating unchanged (`quotes.create` / existing quote codes); the Daycare page button is hidden without it.
