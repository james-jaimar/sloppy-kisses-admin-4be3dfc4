# Make Stay & Play visible everywhere

Stay & Play sessions exist and work on the Daycare board and staff tablet view, but the flag is invisible in most other places staff and customers look. This adds one consistent badge and shows it at every touchpoint.

## One shared badge

Create a single `StayPlayBadge` component (turquoise pill, paw + clock icon, label "Stay & Play", optional collection time, turns red when overdue). Every surface below uses this same component so the indicator always looks identical.

Also add a small list-level hook wrapping the existing per-booking lookup, so any list can ask "which of these bookings have Stay & Play?" in one query.

## Where it will appear

Admin / front desk
- Booking detail panel and booking detail page: badge in the header next to the status chip, plus a Stay & Play section showing origin, expected collection time, current status and an overdue warning.
- Bookings list: badge on rows that have a session.
- Grooming board cards: already chipped — restyled to the shared badge.
- Hotel & Cattery board: badge on the pet lane in the occupancy grid and in the Today panel, so a departure that is actually staying on is obvious.
- Mobile vans and Transport boards: badge on cards whose booking has Stay & Play.
- Calendar week view: badge on the event block.
- Home launcher: Stay & Play count and overdue count surfaced on the Daycare tile's attention line.
- Customer 360 bookings tab and pet detail booking history: badge on the row.

Staff work mode
- My Day and job pages: badge on the job header, with expected collection time so the groomer/handler knows the dog stays on afterwards.
- Daycare work page: already has the lane — keep, restyle to the shared badge.

Customer portal
- My Bookings list and booking detail: badge plus "Collect by HH:MM" so the customer sees what they booked.

## Overdue emphasis

Anywhere a session is past its collection time plus the configured grace period, the badge switches to the destructive style with "Overdue Nm", matching the existing daycare lane behaviour.

## Technical notes

- New: `src/features/daycare/StayPlayBadge.tsx`.
- Reuse `useStayPlayForBookings`, `overdueMinutes`, `fmtCollectTime` from `src/features/daycare/stayPlayQueries.ts`; add the list-level hook in the same file.
- Grace minutes read from `daycare_workflow_settings`, as the daycare board already does.
- Presentation-only work: no schema changes, no trigger changes, no new edge functions.