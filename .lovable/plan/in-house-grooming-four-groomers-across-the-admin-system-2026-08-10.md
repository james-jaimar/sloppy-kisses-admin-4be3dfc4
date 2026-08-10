# In-house grooming: four groomers across the admin system

Today the admin grooming board is one flat set of status columns (Booked, Checked in, Grooming, Ready). The four groomer stations exist as resources and the booking form can assign them, but nothing on the admin side shows who is doing which dog, when a groomer is free, or how full each groomer's day is. This adds a real day diary with one lane per groomer, plus groomer awareness everywhere else in-house grooming appears.

## 1. Day diary (new default view on /admin/grooming)

A view toggle in the header: **Diary** (new, default) and **Board** (existing status columns, unchanged).

```text
          08:00   09:00   10:00   11:00   12:00   13:00
Groomer 1 |  Bella (Full groom) |     | Rex        |
Groomer 2 |        | Milo               |          |
Groomer 3 |  Coco  |        |  Luna |               |
Groomer 4 |                (empty)                  |
----------------------------------------------------
Unassigned: [ Pepper 10:00 · 60 min ]
```

- Time axis across each groomer's workday (currently 08:00-17:00), 15-minute grid.
- Each appointment is a coloured block using the groomer's diary colour, showing pet name, package, start-end, status chip, and the payment / Stay & Play flags already used on the cards.
- Multi-dog bookings (same `booking_group_id`) show a small link badge so staff can see the dogs belong together.
- An "Unassigned" strip for in-house grooms with no groomer; drag one into a lane to assign it.

## 2. Drag to assign and reschedule

- Drag a block to another lane to change groomer; drag along the time axis to change the time (snapped to 15 minutes).
- Both together in one drop: new groomer + new start; end time follows the appointment length.
- A drop that would overlap an existing appointment on that groomer is refused with a toast naming the clash; a drop outside the groomer's working hours asks for confirmation first.
- Status changes stay on the Board view and the booking card actions — the diary is about who and when.

## 3. Per-groomer day header

Above each lane: groomer name, colour dot, number of dogs, booked minutes vs available minutes, and a load bar. A "hide" toggle per groomer for days when someone is off, so the diary doesn't show four lanes when only two are working.

## 4. Groomer awareness elsewhere

- **Board view cards**: show the assigned groomer's name and colour dot; an "Unassigned" warning pill when there is no groomer.
- **Booking detail page**: the resource line becomes an inline groomer picker (change groomer without opening the edit form), with the same clash check.
- **Booking form**: groomer dropdown gains colour dots and a live "free / busy at this time" hint per groomer, so front desk picks a groomer who is actually available.
- **Groomers settings screen**: default colours filled in for the four existing groomers (currently blank) and sort order fixed so they read 1, 2, 3, 4.
- **Work Mode grooming**: filter chips to show only one groomer's dogs for the day.

## 5. Reports

A "Groomer utilisation" section in grooming reporting: dogs done and minutes booked per groomer for the chosen period, plus average overrun (actual vs expected minutes) from the timings already stamped at Grooming / Ready.

## Technical notes

- New `GroomingDiary.tsx` and `diaryQueries.ts` under `src/features/grooming/`, reusing `useGroomingBoardBookings` (extended to return `booking_group_id`, `duration_minutes` and package name) and the existing `useGroomers` hook in `resourceQueries.ts`.
- Reassign / reschedule writes `resource_id`, `start_at`, `end_at` on `bookings` and mirrors `duration_minutes` on `grooming_booking_details`; overlap checks run client-side against the same day's rows, so no schema change is needed.
- Groomer colours and workday hours already exist on `resources` (`colour`, `workday_start`, `workday_end`); one data update fills the four blank colours and normalises `sort_order` (Groomer 1 is currently 10).
- View preference (Diary vs Board) and hidden groomers persist in local storage, matching how other board filters behave.
- Colours come from existing semantic tokens in `src/index.css`; no hardcoded hex in components.