# Staff Work Mode — job workflow for the people on the floor

Everything so far has been admin-facing. This adds a real *doing* layer: a job has a start, a middle, notes/photos/checks, and a signed-off end — plus a separate, deliberately simple tablet interface at `/work` for groomers, hotel/cattery carers, daycare staff and van drivers.

Front desk keeps the current admin UI and can open `/work` too.

## What exists already (verified)

- `bookings.status` enum already covers the whole lifecycle: `confirmed → checked_in → in_progress/grooming → ready → checked_out → completed`, plus `cancelled` / `no_show`.
- `booking_status_events` already logs `from_status`, `to_status`, `actor_user_id`, `event_kind`, `note`.
- Grooming board drag-and-drop already moves cards through Booked → Checked in → Grooming → Ready, and stamps `actual_start_at` / `actual_end_at`.
- Hotel Today panel already has check-in / check-out buttons.
- Daycare already has `daycare_attendance` with `checked_in_at` / `checked_out_at` / status.
- Roles already exist for each department: Front Desk, Grooming, Hotel, Daycare, Driver, Accounts, Read Only.

So the state machine is largely there. What's missing is: the worker-facing surface, the *record* of what was done (checklist, photos, notes, sign-off), incident logging, and per-role landing.

## 1. Data layer

New tables (each with tenant scoping, GRANTs, RLS, timestamps):

- **`job_checklist_templates`** — per tenant, per service type, ordered items (label, icon key, requires_note, active). Editable in Settings so Charlotte controls the list, not a developer.
- **`booking_checklist_items`** — per booking: template item, done boolean, done_by, done_at, optional note. This is the tap-tap record.
- **`booking_photos`** — per booking: kind (`before` / `after` / `incident` / `general`), pet_id, storage key (reuses the existing S3 documents pipeline + signed upload/download edge functions), uploaded_by, caption.
- **`booking_signoffs`** — booking_id, staff profile_id, signed_name, signed_at, summary note. One per booking, editable until the booking is invoiced.
- **`care_rounds`** — hotel/cattery daily care: booking_id, pet_id, round_date, round type (`fed_am`, `fed_pm`, `meds`, `walk`, `play`, `crate_clean`), done_at, staff, note.
- **`incidents`** — booking_id (nullable), pet_id, severity (`note` / `concern` / `urgent`), category (vet, injury, escape, behaviour, illness, other), description, photo refs, raised_by, acknowledged_by/at. Urgent incidents write a `notification_events` row so front desk and admin see a badge.

Job notes reuse `booking_status_events` (`event_kind = 'job_note'`) so the whole timeline stays in one place.

New permission codes, added to the roles matrix in Settings → Roles:
`work.access`, `work.grooming`, `work.hotel`, `work.daycare`, `work.transport`, `work.signoff`, `incidents.raise`, `incidents.acknowledge`.

## 2. The `/work` app

New route tree under `/work` with its own layout (`WorkLayout`) — not the admin sidebar. Design rules, tuned for tablets and low-confidence users:

- Minimum 56px tap targets, large type (18–20px base), high contrast, no dense tables anywhere.
- Bottom tab bar (thumb reach on tablet/phone), max 4 tabs, icon + short word.
- One screen = one decision. Big primary button per card. No dropdown menus; use full-screen sheets.
- Every state change is a big button with an icon and colour: green Start, orange Pause, blue Ready, grey Done.
- Confirmations only where a mistake is costly (complete, incident, no-show); everything else is instant with a toast + undo.
- Uses existing semantic tokens (coral primary, turquoise, green, orange) — no new colour system.

### Screens

**`/work` — My day.** Auto-routes on role. A single vertical list of today's jobs for that person's department, big cards: pet photo/initial, pet name, owner surname, time, service, status colour bar, and one primary action button. A date strip at top (yesterday / today / tomorrow) — no calendar picker.

**`/work/job/:bookingId` — Job screen.** The core of this build.
- Header: pet name, breed/size, owner + one-tap call button, time, status pill.
- Alerts band: vaccination warning (with the existing waive action if permitted), pinned customer notes, medical/behaviour flags.
- Big action button that reflects the next state: **Start** → **Pause / Resume** → **Ready for collection** → **Complete & sign off**. Timer runs visibly while in progress and stamps the existing `actual_start_at` / `actual_end_at`.
- Checklist: full-width tappable rows with a big tick. Long-press or an "Add note" chip attaches a note to an item.
- Photos: two big buttons, "Before" and "After", opening the device camera directly. Thumbnails inline.
- Notes: one tap opens a full-screen note sheet with large text area; saved notes list chronologically.
- **Raise incident**: red outlined button, always visible; opens a sheet with severity, category, description, photo.
- **Complete & sign off**: sheet confirms checklist coverage (warns if items unticked, doesn't block), captures the staff member's name pre-filled from their profile plus timestamp, then sets the booking to `completed`.

**`/work/hotel` — Stays & rounds.** List of in-house pets. Each row = pet + run/room + a row of round chips (Fed AM, Fed PM, Meds, Walk, Play) that turn green as tapped; taps write `care_rounds`. Arrivals and departures for today sit in their own tabs with big Check in / Check out buttons.

**`/work/daycare` — Attendance.** Reuses existing attendance data behind a big-tile grid: tap a pet tile to toggle checked in / out. Adds incident + note per pet, which today's board lacks.

**`/work/vans` — Route.** Driver's stop list in order, each with Arrived / Collected / Dropped buttons and a call-owner button, mapped onto the existing transport leg statuses.

**`/work/me`** — who I am, my jobs done today, sign out.

## 3. Admin side

- Booking detail gets a **Job activity** card: unified timeline of status changes, notes, checklist completion, photos, rounds, incidents, and the sign-off record.
- New **Incidents** admin page (nav item, permission-gated) with open/acknowledged filters; urgent ones raise the sidebar badge via the existing `useNavBadges` hook.
- Settings → new **Job checklists** screen (per service type, drag to reorder) and **Work mode** screen (which roles land where, whether photos are required before sign-off).
- Login routing: staff whose only roles are department roles land on `/work`; front desk, admin and owner land on `/admin/dashboard` with a "Work mode" launcher button in the header.

## 4. Order of work

1. Migration: tables, grants, RLS, permissions, role grants.
2. `WorkLayout` + `/work` My day + role-based routing.
3. Job screen: status machine, timer, notes, checklist.
4. Photos (before/after) on the existing S3 pipeline.
5. Sign-off + completion.
6. Hotel rounds screen + incidents (raise, list, acknowledge, notification).
7. Daycare and vans work screens.
8. Admin: Job activity timeline, Incidents page, Settings screens.

## Technical notes

- No new booking tables — everything hangs off `bookings.id`, consistent with the one-row-per-booking rule.
- Photos go through `documents-sign-upload` / `documents-sign-download` with a `booking_photo` document kind, so retention policy applies automatically.
- All `/work` queries are date-scoped and department-scoped server-side via RLS, so a groomer can't page through hotel data.
- Offline is out of scope for this pass; jobs are small writes and the site has wifi. If dropouts turn out to be a real problem we can add a retry queue later.
