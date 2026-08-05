# Hotel: working quotes, deposit vs pay-in-full, and checkout-day grooming

Three things Charlotte described are only half-built. Here is what is actually in place and what is missing.

## What already works
- Hotel rates exist for exactly the three dog options plus the cattery: Puppy & Small Breeds R445, Cabanas R460, Hotel R560, Cattery R360.
- The 50% deposit split is built in the database: accepting a quote or making a hotel booking creates a deposit invoice and turns the main invoice into a balance invoice due before arrival (lead days from Policy Settings).
- A grooming booking that lands on a hotel checkout date already gets the 50% discount applied automatically to its invoice.

## 1. Quotes — finish the admin flow
The Quotes screens exist but the quote is not usable as a real enquiry-to-quote tool (0 quotes have ever been created).

- **Pets are never captured.** The new-quote drawer sends an empty pet list, so accepting the quote creates a booking with no pets and no accommodation pricing behind it. Add customer-then-pets selection, same searchable pattern used elsewhere.
- **Pricing is manual.** Picking an accommodation only inserts one flat line at the nightly rate. Make the quote price itself off the real rate rules: nights x nightly rate, per-pet counts and multi-pet rates, peak-season uplift — the same maths the booking invoice uses, so the quote and the eventual invoice agree.
- **Cannot actually be sent.** "Mark sent" only flips a status. Add a quote PDF and an email to the customer (through the existing notification/SMTP pipeline and send-lock rules), plus a resend and a visible sent/accepted timeline.
- **Expiry.** Set a validity period (configurable, default 14 days) and show expired quotes as such.
- Accepting a quote continues to create the confirmed booking, deposit invoice and balance invoice.

## 2. Deposit vs pay in full — make the choice visible
The split exists in the data but the customer is never offered the choice.

- On the booking confirmation and in the portal booking detail, show a money strip: total, deposit due now, balance due by date, each with paid/unpaid state.
- Two buttons: **Pay 50% deposit now** and **Pay in full now**. Paying in full settles both invoices in one gateway checkout.
- Balance invoice keeps its own pay link and reminder before arrival.
- Admin booking detail gets the same strip so front desk can see at a glance whether arrival is cleared.

## 3. Checkout-day grooming at half price — customer-facing
Today grooming during a hotel stay is only a free-text request on the accommodation form that staff must schedule by hand.

- Add an explicit option in the hotel booking wizard (portal) and the admin hotel booking form: **"Add a groom on checkout day — 50% off"**, with the package chosen per pet and a live discounted price shown.
- Ticking it creates a real grooming booking on the checkout date, linked to the hotel stay, so it appears on the grooming board and in capacity.
- The 50% comes off automatically via the existing rule and shows as a named line on the invoice; staff can move the slot within the day or remove it.
- The existing hotel groom queue stays for the vaguer "grooming requested" cases.

## Technical notes
- Quote pricing should reuse the hotel invoice pricing logic rather than duplicating it — extract it into a shared database function used by both the quote builder and `hotel_details_auto_invoice`.
- Quote PDF and email mirror the invoice PDF edge function and `send-invoice-email`.
- Checkout-day groom creates a normal `bookings` row (`grooming_inhouse`) with a link back to the hotel booking; the discount continues to come from `grooming_checkout_discount_pct`.
- "Pay in full" needs a checkout that covers deposit + balance invoices in one PayFast transaction, then allocates across both.
