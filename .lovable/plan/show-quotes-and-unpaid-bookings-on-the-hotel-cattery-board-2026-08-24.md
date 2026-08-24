# Show quotes and unpaid bookings on the Hotel & Cattery board

## What I checked

- The board's booking query (`useHotelBookingsInWindow`) has **no status filter**, so customer-made and `pending_payment` bookings do already draw bars — but cancelled ones draw too and count towards occupancy.
- The window in the screenshot (21 Sept → 4 Oct) is genuinely empty: the latest hotel booking in the database is BK00247, 31 Aug → 4 Sep, status `pending_payment`.
- **Quotes never reach the board.** There are 5 hotel quotes in `estimates` (e.g. QU-00001 for 7–12 Sep, QU-00003 for 10–13 Nov, QU-00004 for 1–5 Dec) and nothing on the hotel screen reads that table.
- The Today panel's arrivals list only counts `confirmed`/`approved`/`requested`, so an unpaid arrival is invisible there.

## What to build

1. **Pencilled quotes on the grid**
   - New query for `estimates` overlapping the window, hotel/cattery service types, status `draft` or `sent` (exclude accepted, cancelled, expired — accepted ones already have a booking).
   - Render each as a dashed, hatched bar in the resource row when the quote names one, otherwise in a new "Pencilled / quotes" row at the bottom of the grid.
   - Bar shows quote number, customer, pets, total, and remaining hold time when `hold_expires_at` is set. Clicking opens the quote.

2. **Separate provisional from firm occupancy**
   - Day counters show firm pets (confirmed / checked-in / completed) as today, plus a lighter "+N held" figure for quotes and unpaid bookings, so staff see the true risk without the numbers pretending a quote is a booking.
   - Stop counting `cancelled` and `no_show` bookings in the day totals and the peak figure.

3. **Header toggle + legend**
   - Chips above the grid to show/hide "Quotes (held)", "Awaiting payment" and "Cancelled"; defaults on for the first two, off for cancelled.
   - Small legend explaining solid = firm, dashed = held/unpaid.

4. **Today panel**
   - Include `pending_payment` in arrivals, tagged "Unpaid" so front desk can chase before check-in.
   - Add a compact "Quotes holding dates" list for quotes starting in the next 7 days.

## Technical notes

- New `useHotelQuotesInWindow` in `src/features/hotelCattery/queries.ts` selecting `id, estimate_number, status, service_type, start_at, end_at, hold_expires_at, total, resource_id, customer:customers(full_name), pet_ids` and filtering overlap client-side, same shape as the bookings hook.
- `buildSegments` / `usedOnDay` in `OccupancyGrid.tsx` gain a `kind: "firm" | "held"` on each segment so lanes and counts can split.
- Pet names for quotes come from `pet_ids`; resolve with one `pets` lookup keyed by the ids in view.
- Frontend and query only — no schema changes.
