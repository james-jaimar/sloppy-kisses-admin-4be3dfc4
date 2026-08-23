# Portal: drop the duplicate address, add "Save as a quote"

## 1. "Your details" step — remove the free-text home address

On step 2 of the hotel booking (portal wizard and the "complete the form later" page) there is a free-text **Home address** box, pre-filled from the old text field on the customer record. The verified, Google-pinned address is already chosen on step 1, so this box is both duplicated and unreliable.

What changes:

- The Home address box is removed from the Owner information card. The step keeps name, ID number, email and mobile.
- The address still needs to appear on the printed accommodation form, so it is filled in behind the scenes from the customer's verified address (the one picked on step 1, otherwise their primary saved address).
- The step's "complete" check no longer requires an address to be typed.

## 2. Customers can price a stay and save it as a quote

Today the portal shows a live estimated total but the only exit is "Book now". Customers get a **Save as a quote** action alongside it.

- Saving creates a real quote (same object front desk creates from Admin → Quotes), with the dates, pets, accommodation type per pet, add-ons and total already worked out.
- The customer immediately sees the quote in a new **My quotes** page in the portal, and gets the usual branded quote email with the PDF.
- Each quote shows a clear "These dates are held for you until …" countdown, plus **Accept & book** and **Cancel this quote** buttons. Accepting converts it into the booking and invoice exactly as the emailed public accept link already does.
- While a quote is live, its dates count against hotel capacity as "pencilled in" (this already happens for staff quotes), so the same night cannot be sold twice.

## 3. Holds expire so the calendar cannot be blocked

- Admin → Settings → Hotel & Cattery workflow gets a new **Customer self-quote** block:
  - on/off switch for letting customers save quotes themselves,
  - **hold length in hours** (default 48, booking.com-style),
  - **maximum live quotes per customer** (default 3) so nobody pencils in the whole calendar.
- Staff-issued quotes keep their existing validity in days; the hours setting applies only to self-service portal quotes.
- When the hold lapses the quote expires automatically, the dates are released, and the customer sees it as "Expired — dates released" with a "Re-price this stay" button that reopens the wizard on the same dates.
- The customer is emailed a reminder a few hours before the hold lapses (reuses the existing notification pipeline).

## Technical notes

- `OwnerSection` in `src/features/hotelForm/AccommodationFields.tsx` loses the `Area` field; `isOwnerComplete` drops `home_address`. The payload key stays and is populated in `prefillOwner`/`AccommodationFormPage` from the selected `customer_addresses` row (formatted address + unit), so the printed form and stored payloads are unchanged in shape.
- Migration: add `hold_expires_at timestamptz` to `estimates` (hour precision; `hold_until` stays for display/back-compat), and add `portal_quotes_enabled boolean`, `portal_quote_hold_hours integer default 48`, `portal_quote_max_active integer default 3` to `hotel_workflow_settings`. Update `hotel_pencilled_by_day` and `expire_quote_holds` to prefer `hold_expires_at` when set, and reschedule `expire-quote-holds-daily` to run hourly.
- New edge function `portal-create-quote`: service-role, verifies the caller owns the customer, enforces the enabled flag and the max-active-quotes cap, reuses the pricing helpers behind `NewQuoteDrawer`/`hotel_stay_lines_pets` so portal and admin totals cannot drift, writes the estimate with `status='sent'` and `hold_expires_at = now() + hold hours`, then calls `send-quote-email`.
- Portal UI: `HotelRequestWizard` gains the secondary "Save as a quote" button on the review step; new `src/features/customerPortal/quotes/MyQuotesPage.tsx` and `MyQuoteDetailPage.tsx` at `/customer/quotes` (+ sidebar entry), reading `estimates` under the existing `estimates_customer_select_own` policy. Accept calls the existing `accept_public_quote` path via an edge function; cancel sets `status='cancelled'` through the same function so RLS stays read-only for customers.
- Expiry reminder: a `notification_events` row of a new `quote_hold_expiring` type queued by the hourly expiry job.
