# Hotel quote: same rules as a real booking, plus a proper hold

## 1. Modal padding

`ModalShell` gives its scroll area no horizontal padding — each screen supplies its own, and the New quote drawer forgot to. Add the standard `px-6 py-5` to the quote body so fields stop touching the edges, and give `ModalShell` a sensible default so any future screen can't repeat it.

## 2. Pick up the dog's size

Rate cards are keyed by species and accommodation type only, so nothing in the quote ever looks at the pet. Change the pets step to:

- show each selected pet as a chip with its size (using the staff size override when one is set),
- mark the accommodation options that suit those pets, and show an amber note when the chosen area doesn't match (e.g. a large dog put into "Puppy & Small Breeds Area"),
- default the accommodation to the best match when all pets are the same size band.

Sizing stays advisory — front desk can still override, because rooms get juggled.

## 3. Arrival and collection rules from the accommodation form

Rules to enforce (hotel bookings and quotes alike):

- Check-in 09:00–11:00, Monday to Saturday. No check-in on Sundays or public holidays.
- Check-out 09:00–09:30, seven days a week.
- Stay & Play collection 16:00–16:30, seven days a week.
- No drop-offs on any public holiday; no collections or drop-offs on 25 and 26 December or 1 January.

To do that we need a holiday list the owner controls: a Settings screen (Hotel workflow → Arrival & collection) with South African public holidays seeded for the current and next year, plus the three hard-closed dates flagged as "no movement at all". The date pickers then grey out blocked arrival/departure days and explain why, and the same check runs server-side when the booking is created so the portal can't sneak one through.

## 4. Quote should mirror the booking form

The quote drawer is missing what the booking modal already has. Add to it:

- **Stay & Play / late collection** tick, which sets the 16:00–16:30 collection window and prices the existing late-checkout surcharge.
- **Grooming during the stay** tick with notes, priced from grooming packages by pet size, carried into a hotel groom request when the quote is accepted.
- Other hotel surcharges (same picker the booking uses).
- Check-in and check-out window pickers, respecting the day rules above.

Accepting the quote then creates the booking with all of it already attached, instead of a bare stay.

## 5. Holding the dates (and letting them go)

Today a quote reserves nothing — capacity is only consumed when it's accepted, so two quotes can promise the same last kennel. Proposed behaviour:

- A sent quote places a **pencil hold** on the room for those dates until its expiry date (validity days already exist in Hotel workflow settings, default 14 — the form's own wording suggests 7 for hotel).
- Occupancy and the capacity notice count pencil holds separately from confirmed stays: "3 confirmed, 1 pencilled" with the amber styling, so front desk always sees what's real.
- A confirmed booking always outranks a pencil hold; if the room fills, the hold shows as "at risk" on the quotes list and the quote can be re-quoted or waitlisted.
- A nightly job expires quotes past their date, releases the hold, marks them expired and emails the customer that the dates are no longer held.
- Accepting a quote converts the hold into the real booking, re-checking capacity at that moment and refusing with a clear message if it went in the meantime.

## Technical notes

- Padding: `NewQuoteDrawer` body wrapper + default padding in `ModalShell`'s scroll container.
- Size: read `pets.size` / `size_override`; add an optional `size_bands text[]` to `hotel_rate_cards` with a Settings control so the owner defines which area suits which size, rather than hard-coding "Puppy & Small Breeds".
- Holidays: new `public_holidays` table (tenant, date, name, `blocks_dropoff`, `blocks_collection`) seeded for SA; validation helper shared by the date pickers, `bookings_block_closed_days`-style trigger and `portal-create-booking`.
- Windows: reuse `CHECK_IN_WINDOWS` / `checkOutWindowsFor` from `src/features/hotelForm/accommodationForm.ts`; extend `checkOutWindowsFor` to also handle blocked days, and add a matching `checkInAllowed(date)`.
- Quote extras: store Stay & Play / surcharges / groom request on the estimate (new `extras jsonb` or estimate item metadata) so `accept_estimate` can write `hotel_booking_surcharges` and `hotel_grooming_requests`.
- Holds: `estimates.hold_until` + status `sent` counted by `hotel_day_availability` as provisional; cron function `expire-quote-holds` running daily.

## Open choice

Hold length: the accommodation form implies dates aren't guaranteed until paid. Default is the existing quote validity (14 days) — say the word and I'll set hotel quotes to 7 days, or make the hold only start once the quote is sent rather than created.
