## Finish Phase 1 — Recurring bookings, drag-to-reschedule, per-resource day view

Three deferred slices, delivered together, then memory-bank the rest of the roadmap so we don't lose it.

---

### 1. Recurring bookings (uses existing `recurring_rules` table)

**UI**
- New "Repeat" section inside `BookingFormModal` (collapsed by default).
- Fields: frequency (none / daily / weekly / monthly), interval, weekdays (Mon–Sun chips when weekly), end mode (never / on date / after N occurrences).
- Human-readable summary line ("Every week on Mon, Wed until 30 Nov 2026").

**Data flow**
- On create: if a rule is set, insert into `recurring_rules` linked to the "template" booking, then generate occurrences up to a rolling horizon (default 60 days).
- Each generated occurrence is a real row in `bookings` with `recurring_rule_id` set + all typed details copied.
- On edit of a single occurrence: offer "this only" vs "this and future" (future = re-generate from this date forward).
- On cancel: same choice; "this and future" deactivates the rule and cancels forward occurrences.

**Backend**
- One migration: add `recurring_rule_id uuid` + `is_recurring_template boolean` to `bookings` if missing; add index; ensure `recurring_rules` has the needed columns (freq, interval, byweekday int[], until, count, active).
- Occurrence generator lives client-side for now (pure function in `src/features/bookings/recurrence.ts`) with unit tests — no edge function needed yet.

**New/edited files**
- `src/features/bookings/recurrence.ts` (rule → dates)
- `src/features/bookings/RecurrenceFields.tsx`
- `src/features/bookings/recurringQueries.ts` (create rule + generate + bulk insert; update-forward; cancel-forward)
- `BookingFormModal.tsx` — mount RecurrenceFields, wire save
- `BookingDetailPanel.tsx` — show "Part of a series" badge + "Edit / Cancel: this / this & future" actions

---

### 2. Drag-to-reschedule on the calendar

- `CalendarWeekView.tsx` gets HTML5 drag on booking chips.
- Drop target = time slot cell; snap to 15-min grid.
- On drop: optimistic update, call `updateBooking({ start_at, end_at })` preserving duration, re-run conflict check, toast + undo.
- Show a ghost chip while dragging with the new time label.
- Blocked for statuses `checked_in`, `in_progress`, `checked_out`, `completed`, `cancelled`, `no_show` (visual "not-draggable" cursor).

---

### 3. Per-resource day view (resource lanes)

- New view mode toggle on calendar: **Week / Day**. Default stays Week.
- Day view lays resources out as columns (lanes), 15-min rows.
- Filter chips at top: resource type (grooming / mobile van / hotel / cattery / daycare / transport) — hides irrelevant lanes.
- Empty lanes for active resources still render so ops can drop into them.
- Drag-to-reschedule works across lanes too → changes `resource_id` on drop.

**New/edited files**
- `src/features/calendar/CalendarDayView.tsx`
- `src/features/calendar/CalendarPage.tsx` (or wherever the toggle lives) — view switcher + resource-type filter
- `CalendarWeekView.tsx` — extract shared chip + drag helpers into `calendarShared.ts`

---

### 4. Memory-bank the remaining roadmap

Write these so future sessions apply them automatically:

- `mem://index.md` — bootstrap Core rules (semantic tokens only, one-booking + typed-details pattern, resources as first-class, notifications via `notification_events`).
- `mem://features/roadmap` — Phases 2–8 exactly as approved (Grooming board → Hotel/Cattery occupancy → Mobile vans + maps → Pickup/Drop-off → Daycare enrolments → Estimates/Invoices/Payments + provider decision → Automated comms + vaccination gate → Customer portal → Retail & inventory → Reports → Users/roles/settings).
- `mem://features/booking-model` — "one bookings row + typed `*_booking_details` row per service; never split into per-service booking tables."
- `mem://features/notifications` — "all customer-facing comms flow through `notification_events`; respect `customers.notify_email`."
- `mem://design/tokens` — coral primary, semantic tokens in `index.css`, no hardcoded colors.

### Technical notes

- Recurrence generation: pure function, tested with vitest against DST edges and month-end weekly cases.
- Bulk occurrence insert uses a single `.insert([...])` per call; details rows inserted in a follow-up `.insert([...])` keyed by returned booking ids.
- Drag uses native HTML5 DnD (no new dep). Snap logic shared with future resize handles.
- Day view reuses existing `useResources` + `useBookings` queries with a date-scoped range.
- Conflict guard already exists — reused on drop and on recurring generation (skips + reports conflicts, doesn't block the whole series).

### Out of scope for this pass

- Resize-to-extend on calendar (add after drag ships)
- iCal export
- Server-side recurrence expansion (revisit when horizon grows past 60 days)
