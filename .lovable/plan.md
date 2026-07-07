## Root cause

Confirmed by inspecting the DB: booking `BK00001` for Charlie exists on `2026-07-09` (`start_at = 2026-07-09 07:00 UTC` = 09:00 SAST), status `confirmed`, service `grooming_inhouse`. It should appear in the **Booked** column.

The grooming board query filters like this:

```ts
const dayStr = day.toISOString().slice(0, 10);   // ← UTC-based
.gte("start_date", dayStr).lte("start_date", dayStr)
```

`day` is set to local midnight (`startOfDay(new Date())`). In SAST (UTC+2), local midnight of 9 Jul is `2026-07-08 22:00 UTC`, so `toISOString().slice(0,10)` returns **`"2026-07-08"`** — one day behind. The query asks for bookings dated 8 Jul, finds none, and every column shows 0.

The calendar page doesn't have this bug because it filters with `isSameDay(new Date(b.start_at), anchor)`, which is timezone-correct.

I searched the whole codebase — `toISOString().slice(0, 10)` only appears in the two spots I added last turn (`src/features/grooming/queries.ts` lines 50 and 132). No other view is affected.

## Fix

**1. Replace date-string filter with a `start_at` range in `useGroomingBoardBookings`.** This is what the calendar effectively does, guarantees timezone-correct matching, and doesn't rely on `start_date` being kept in sync with `start_at`.

```ts
const dayStart = new Date(day); dayStart.setHours(0, 0, 0, 0);
const dayEnd = new Date(dayStart); dayEnd.setDate(dayEnd.getDate() + 1);
...
.gte("start_at", dayStart.toISOString())
.lt("start_at", dayEnd.toISOString())
```

Also update the react-query key from `dayStr` to `dayStart.toISOString()` so the cache keys off the correct day.

**2. Fix the vaccination-check "today" string** to use local date parts (`YYYY-MM-DD` built from `getFullYear/getMonth/getDate`) instead of `toISOString()`. Currently only affects behaviour in the 2 hours around local midnight, but same bug family — fix it while we're here.

**3. No other files touched.** Sweep confirms this pattern only exists in the two lines above.

## Verification after fix

- Navigate to `/admin/grooming` with "Today" = 9 Jul 2026 → the Booked column should show Charlie's card.
- Drag the card to **Checked in**, then **Grooming**, then **Ready** → confirm status updates and the timer appears in Grooming.
- Flip the date picker back one day → Charlie disappears; forward one day → still empty. Correct behaviour.

No schema changes. No changes to the calendar, bookings list, or any other view.