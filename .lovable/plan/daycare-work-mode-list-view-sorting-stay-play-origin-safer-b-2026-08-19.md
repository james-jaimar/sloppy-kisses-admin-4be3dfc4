# Daycare work mode: list view, sorting, Stay & Play origin, safer buttons

## 1. "My day" only shows 6 entries

This is not a bug in the list. Checked the data: today there are exactly 6 `daycare` bookings, while the Daycare tab says "46 expected". The two screens read different sources:

- **My day** lists **bookings** rows for the day.
- **Daycare** lists **expected pets**, which is built from monthly daycare **enrolments** (recurring day patterns) plus walk-ins — most enrolled dogs have no per-day booking row.

So both numbers are correct for what they show, but the labels make it look broken. Fix by making it explicit rather than changing the data model:

- For daycare-only staff, "My day" is redundant with the Daycare tab. Their landing tab becomes **Daycare**, and My day is hidden when Daycare is their only department.
- Where both are visible, "My day" gets a one-line hint under the header: "Booked jobs only — enrolled daycare dogs are on the Daycare tab."
- Daycare header wording becomes "1 in · 46 due today" to stop reading as a booking count.

## 2. List view on the Daycare tab

Add a compact list mode alongside the current cards, with the choice remembered on the device (same pattern as the admin daycare board):

- Card view (today's default): big In/Out buttons, notes.
- List view: one tight row per dog — avatar, name, owner, plan, status pill, small In/Out buttons, note icon with today's note count. Fits far more dogs per screen on a tablet.

## 3. Sorting

A sort control in the Daycare header:

- Name A→Z / Z→A
- Status (still to arrive first, then in, then collected)

Sorting applies to both views. Choice persists per device.

## 4. Stay & Play marking, with origin

Every dog that has a Stay & Play session today gets the shared Stay & Play badge on its card/row, extended to name where it came from — "Stay & Play · Grooming" or "Stay & Play · Hotel" — plus the expected collection time and the existing red overdue state. Also shown:

- A "Stay & Play" filter chip in the header so staff can isolate those dogs.
- The badge appears on the Daycare tab cards and rows, not just in the existing Stay & Play lane at the top.

## 5. Buttons stay clickable after being pressed

Today In/Out only change colour, and every card is disabled while any save is in flight. Change to:

- The button matching the current state becomes the **active/selected** state, disabled, with a tick and the recorded time ("In 08:42").
- Only the card being saved shows a spinner; the rest of the board stays usable.
- Once checked out, In is disabled — an "Undo" action on the row handles genuine mistakes, so state can only move forwards by tapping.
- Double taps are ignored while the mutation for that pet is running.

## 6. Clearer status

Each dog shows an explicit status pill instead of relying on button colour:

- Grey "Due" — nothing recorded yet
- Green "In · 08:42"
- Blue "Out · 15:10"
- Orange "No-show"
- Plus the Stay & Play badge where relevant

Header counters become tappable filter chips: Due / In / Out / Stay & Play, with counts, so staff can see at a glance and filter to what's left.

## Technical notes

- `src/features/work/DaycareWorkPage.tsx`: view mode, sort, filter chips, per-pet pending state, status pills, Stay & Play badge. Persist view/sort in `localStorage` under `sk.work.daycare.*`.
- New `src/features/work/DaycareWorkList.tsx` for the list rendering.
- Stay & Play: reuse `useStayPlayForDay` from `stayPlayQueries.ts`, keyed by `pet_id`; extend `StayPlayBadge` with an optional `showOrigin` prop (data already carries `origin`).
- Per-pet pending: track the pet id currently saving instead of using the shared `upsert.isPending`.
- Tab visibility/landing: `src/features/work/WorkLayout.tsx` and `useWorkDepts.ts`.
- Presentation and client-state only: no schema changes, no new tables, no edge functions.
