## What's wrong

Confirmed with database queries for Mon 3 Aug 2026:

| Source | Count |
|---|---|
| `bookings` rows with `service_type` daycare/daycare_assessment (what the Home tile counts) | **18** |
| `daycare_attendance` rows for the day | **40** |
| Active enrolments scheduled for Monday (what the Daycare board counts) | **40** |

Two different definitions of "daycare today" exist:

- **Home tile + Admin dashboard** use `useDashboardTodayStats` in `src/features/dashboard/queries.ts`, which counts `bookings` rows.
- **Daycare board / Work mode** use `useExpectedForDay` in `src/features/daycare/queries.ts`, which resolves active enrolments for the weekday, applies day swaps, and merges walk-ins from `daycare_attendance`.

Daycare is a recurring-enrolment service, so most attendances have no `bookings` row — only 18 do. The board's 40 is the correct operational number; the tile's 18 is the wrong source.

## The fix

1. Add a lightweight, count-only "daycare expected today" resolver (shared, in `src/features/daycare/queries.ts`) that mirrors the board's logic: active enrolments matching the weekday and date window, minus swap-outs, plus swap-ins, plus walk-in attendance rows not already counted.
2. Change the Daycare figure in `useDashboardTodayStats` (`src/features/dashboard/queries.ts`) to use that resolver for both today and yesterday, so Home tile, Admin dashboard, and Daycare board always agree.
3. Leave Grooming, Mobile vans, Hotel and Transport counts on the bookings table — those services really are booking-driven.

## Verification after the change

- Re-check that the Home tile shows 40 for Mon 3 Aug and matches the Daycare board exactly.
- Spot-check the other four tiles against their department boards for the same day and report any further mismatches before touching them (I have not yet confirmed whether Hotel/Grooming/Vans/Transport differ — that check is part of this work, not an assumption).

## Technical notes

- No database or schema changes; presentation/query layer only.
- The resolver will be a plain async function so the dashboard hook can call it inside its existing `Promise.all`, rather than a hook that would break the current structure.
