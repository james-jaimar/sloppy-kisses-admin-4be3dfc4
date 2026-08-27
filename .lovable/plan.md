# Daily printed lists for the floor staff

A "Daily lists" section in admin that turns what's in the system into clean, tickable A4 sheets the front desk can print each morning and hand to daycare, grooming, hotel and the vans. No new data — these read the same bookings, enrolments and rounds the boards already use.

## Where it lives

New sidebar item **Daily lists** (permission-gated, visible to front desk, admin, owner) at `/admin/lists`.

One screen:

- Big date picker (defaults to today, arrows for yesterday/tomorrow — hotel and daycare are often printed the night before).
- Four tabs: **Daycare**, **Grooming**, **Hotel & Cattery**, **Mobile vans**.
- A preview of the sheet exactly as it will print, plus **Print** and **Download PDF** (print-to-PDF via the browser dialog).

Each sheet prints with a header band: Sloppy Kisses logo, sheet name, the date in full (Thursday 27 August 2026), and a "Printed at 06:12 · page 1 of 2" footer, so nobody works off yesterday's list.

## Design rules for the sheets (this is the important bit)

Because these go to staff who are more comfortable on paper than on screen:

- Black on white, no colour blocks that eat toner or turn grey and unreadable.
- Large type: names at ~13pt bold, everything else ~10–11pt. Generous row height so a pen fits.
- Every actionable thing is an empty square box to tick, never a coloured pill.
- One line per animal wherever possible; alternating light row shading so the eye doesn't slip.
- Icons are avoided in print — words instead ("MEDS", "SPECIAL FOOD"), because an icon has to be taught.
- Warnings (meds, allergies, aggression, no-go notes) print in a bold boxed strip on the row, not as a footnote.
- Always a wide **Notes** column and a **Staff initials** column at the far right.
- Landscape where a sheet needs the width (hotel, vans), portrait for daycare and grooming.

## The four sheets

### 1. Daycare register (portrait)

Sourced from enrolments due that day plus walk-ins — the same list the Daycare board shows, so counts match.

Columns: Dog · Owner · Plan · Arrived (time box) · Collected (time box) · Fed · Meds · Notes · Initials.

- Dogs with any alert (meds, allergy, behaviour, vaccination expiring) get a bold left rule and the reason spelled out.
- Stay & Play dogs are grouped in their own block at the bottom with "expected collection" time, since they leave later.
- Footer: total expected, plus blank lines for unexpected walk-ins to be written in.

### 2. In-house grooming run sheet (portrait)

One block per appointment, in time order, per groomer (a page break between groomers so each gets their own sheet).

Each block: time · dog · breed/size · owner · package and add-ons · the styling brief in plain words (blade/length, face, feet, tail, ears, nails, teeth) · a "before/after photo taken" tick pair · start/finish time boxes · initials.

Appointments with no styling preferences captured print a bold **NO BRIEF — ASK FRONT DESK** strip so the groomer doesn't guess.

### 3. Hotel & cattery daily care sheet (landscape)

The complicated one, so it splits into three printable sheets under the same tab:

- **Occupancy / who's in** — room or area · pet · owner · arrival day · departure day · flags (meds, own food, grooming booked during stay). Arrivals and departures for the day are listed first in their own boxed section, with arrival window and collection window times.
- **Rounds sheet** — one row per pet, columns of tick boxes for AM feed, PM feed, meds AM, meds PM, walk, play, crate/room clean, plus initials per round. This mirrors the care rounds already recorded in work mode, so whatever is ticked on paper can be captured later.
- **Feeding & meds card** — one row per pet with the exact food/meds instructions in full text, printed larger, for the person doing the round.

### 4. Mobile van run sheet (landscape)

One sheet per van per day, in stop order.

Columns: # · time · dog · owner · service · address (full, plus access notes/gate code as a second line) · arrive/leave time boxes · payment collected box · initials.

- Phone numbers respect the existing "hide customer phone numbers" policy — if it's on, the number is left off the printout too.
- A route summary line at the top: number of stops, first stop time, last stop time.
- Stops with an unverified address print a bold **ADDRESS NOT VERIFIED** marker.

## Technical notes

- New folder `src/features/lists/`: `DailyListsPage.tsx` (date + tabs + print controls) and one component per sheet — `DaycareRegisterSheet.tsx`, `GroomingRunSheet.tsx`, `HotelDailySheet.tsx`, `VanRunSheet.tsx`.
- Data comes from existing hooks — `src/features/daycare/queries.ts` and `stayPlayQueries.ts`, `src/features/grooming/queries.ts`, `src/features/hotelCattery/queries.ts` plus `useCareRounds` in `src/features/work/queries.ts`, and `src/features/mobileVans/queries.ts`. No new tables, RPCs or edge functions.
- Printing uses the browser print pipeline (same pattern as `CustomerStatementPage.tsx`: `print:` Tailwind variants + `window.print()`), with a shared `PrintSheet` wrapper handling the header band, page size/orientation via `@page`, and repeated table headers across pages.
- A small block of `@media print` rules added to `src/index.css` for page margins, orientation classes, `break-inside: avoid` on rows and blocks, and forcing pure black text.
- Route registered in `src/App.tsx` under the admin layout; nav entry in `src/constants/navigation.ts` behind a new `lists.view` permission code granted to front desk, admin and owner, with a Settings → Roles entry so access can be changed without a developer.
- Phone visibility reuses `src/lib/privacy/useCustomerContactVisibility.ts`.

## Not included

- Emailing or auto-printing the sheets on a schedule.
- Capturing back what was ticked on paper (staff still enter it in the system, or front desk does).

Both are natural follow-ups once the sheets are in daily use.
