# Simplify the daycare login and give it real notes

## Why the daycare login looks wrong today

The Daycare Staff role carries `reports.view`, which the landing logic counts as an "admin" permission — so daycare staff land in the full admin app (Home, Customers, Pets, Bookings, Daycare, Reports) instead of the tablet work screen. The role also holds `bookings.view`, `customers.view`, `pets.view`, `documents.view` and `daycare.manage`, which is far more than check in/out needs.

There is also no way for daycare staff to write a note. The attendance record has a `notes` field but nothing in the UI writes to it, and incidents can be raised but there is no admin screen anywhere that lists them — so a raised incident is currently invisible to the office.

## 1. Trim the daycare role

Daycare Staff keeps only: work access, daycare work board, check in/out, add notes, raise incidents. Drop `reports.view`, `bookings.view`, `documents.view` and `daycare.manage`. `customers.view`/`pets.view` stay read-only so a dog's card can open its details.

Result: signing in as Daycare lands straight on the daycare work board at `/work/daycare`, no admin sidebar. A "read-only pet detail" opens from a dog card only.

## 2. Notes daycare staff can add

Three note buttons on each dog's card (and inside the dog's day sheet):

- **Day note** — about today only, e.g. "off her food", "went home in a red lead". Saved against today's attendance record. Shows on the card for the rest of the day, then lives in that dog's history.
- **Lasting note** — saved to the dog's profile so it shows on every future daycare day and to the office. Marked as pinned so it appears in the alert strip at the top of the dog's card.
- **Note to the office** — a day note ticked "needs office attention". This is the actionable one: it lands in an office worklist.
- **Incident** — the existing incident sheet (injury, escape, illness, behaviour) with severity, kept as is.

All notes are internal. Nothing written by daycare staff shows in the customer portal.

## 3. Where the notes go and who acts on them

- **Attendance history** — every day note stays on the attendance row for that dog and date, visible on the admin Daycare → Attendance tab.
- **Pet and customer record** — lasting notes appear in the dog's Notes section and mirror onto the customer's Notes tab, alongside the notes admin already writes.
- **Office worklist** — a new "Needs attention" panel on the admin Daycare board and on the front-desk Home launcher, showing today's flagged notes plus open incidents, each with who wrote it, when, the dog, and a **Mark handled** button. Handled items drop off the list but stay in history.
- **Badge** — a count on the Daycare nav item so front desk sees unhandled items without hunting.

## 4. Admin control

Notes and incidents are already permissioned; the new "note to office" flag reuses `incidents.raise`-style gating with a new `daycare.notes` permission so the owner can grant or remove it per role in Users & roles.

## Technical notes

- Migration: adjust `staff_daycare` role permission grants; add a `daycare.notes` permission; add `office_flag boolean` + `handled_at`/`handled_by` columns to `daycare_attendance` note handling (or a small `daycare_day_notes` table if more than one note per dog per day is wanted — one row per note is the safer shape and is what this plan assumes).
- Lasting notes write to the existing pet/customer notes tables so nothing new is invented for them.
- Frontend: note sheet component reused from `IncidentSheet` styling, wired into `DaycareWorkPage` cards; new "Needs attention" panel in `DaycareBoardPage` and the Home launcher; incident list gets its first admin surface here.
- Landing: remove `reports.view` from the daycare role so `landingFor` routes them to `/work/daycare`; no change to the landing code itself.
