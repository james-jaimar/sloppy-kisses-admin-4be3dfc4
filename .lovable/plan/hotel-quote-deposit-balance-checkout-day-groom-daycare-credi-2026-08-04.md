# Hotel: quote → deposit → balance, checkout-day groom, daycare credit, digital booking form

Charlotte's hotel flow is: enquiry → quote → 50% deposit to secure → invoice → balance before arrival, with a booking/vaccination form on file, Stay & Play if collection is after 09:00, a 50% grooming discount on checkout day, and daycare credits when a daycare dog stays over.

Most of this exists already (rate cards for Puppy & Small Breeds / Hotel / Cabanas / Cattery, Stay & Play, vaccination gate, capacity, cash payment methods, late-checkout surcharge R250). Four things are missing.

## 1. Quotes → deposit → balance

There is an `estimates` table with no screens (0 rows, no UI anywhere in the app).

- New **Quotes** section: list, create from a customer + pets + dates + accommodation type, line items priced off the hotel rate cards, PDF + email to the customer, statuses draft / sent / accepted / expired.
- Accepting a quote creates the hotel booking and issues a **deposit invoice** for the configured deposit % (already a setting: Policy Settings → Deposit %, default 50).
- The remaining balance becomes a second invoice, dated so it falls **due before the check-in date** (lead days configurable).
- Hotel bookings today auto-issue one full invoice; that becomes deposit + balance. Existing issued hotel invoices are left alone.
- Booking detail gets a clear money strip: quote → deposit (paid/unpaid) → balance (paid/unpaid) → arrival blocked/OK.
- Staff can still skip the quote and book directly; the deposit/balance split still applies.

## 2. Checkout-day grooming at 50% — automatic

When a grooming booking falls on a hotel guest's checkout date, the 50% discount is applied automatically, shown as a named line ("Hotel checkout groom −50%"), and staff can remove it on the booking. Also offered at hotel booking time and in the portal hotel wizard ("Add a groom before going home — half price").

## 3. Daycare credit for hotel nights — automatic

For a customer on an active daycare enrolment, each hotel night falling inside their paid daycare month generates a credit at their daily daycare rate (plan price ÷ billed days), applied to their next daycare invoice as a visible credit line. Shown on the hotel booking and on the daycare invoice so it is auditable, and reversed if the hotel stay is cancelled or shortened.

## 4. Digital Dog/Cat Accommodation Form

A portal + public form mirroring the Word doc: owner + ID, emergency contact, vet & medical aid, booking dates/times, per-pet details (breed, age, sex, size, colour, behaviour, health checklist), vaccination dates (5-in-1/DHPP, Rabies, Kennel Cough, tick & flea product) with card and photo upload, feeding/medication/grooming notes, and the acknowledgment signature (name + IP + timestamp, matching the existing consent pattern).

- Existing customers see everything pre-filled and only complete what's missing.
- Submissions write straight to customers / pets / emergency contacts / vaccinations / documents — no re-typing.
- Readiness checklist on each hotel booking: form received, vaccination records, deposit paid, balance paid. Kennel Cough must be 10+ days before arrival (warn via the existing vaccination gate).

## Also included

- Check-out time asked on every hotel booking, with Stay & Play auto-suggested when it is after 09:00.
- Cancellations already handled; the deposit is treated as non-refundable per the existing deposit setting.

## Technical notes

- New hotel workflow settings: balance-due lead days, checkout-groom discount %, daycare-credit on/off.
- Quotes reuse `estimates` / `estimate_items`, with a `next_estimate_number` function mirroring invoices.
- Deposit/balance split lives in the existing hotel auto-invoice trigger path, not in the UI.
- Daycare credit uses the existing `customer_credit_ledger` / credit-note machinery.
- The form uses the existing `form_submissions` + S3 document upload plumbing.

## Not in this round

- Importing the historical hotel bookings spreadsheet — better as a separate pass once this flow is agreed.