## What the Detailed Sheet gives us

I parsed the tab. Every row now has:

- **Owner full name** in col B (e.g. `Tracy Williams - Abby (Collie X) & Jackson (Lab X)`) — Charlotte has cleaned these up, so the owner name is real, not just the dog surname.
- **Mobile number** in col C — a second, very strong identity key.
- **Dog name + surname**, **breed**, **size**, **sex**, **days per week**, and the **weekly pattern** (Mon–Fri "x" marks).
- **Per-date attendance** for every weekday from **1 Jul 2026 through 3 Jan 2027** (135 date columns). Each cell holds the dog's first name on days they're due in.

141 rows total (I'll drop the "Teest Charlotte" test row); 139 with real July bookings.

## Plan

### 1. Replace the seed (`daycareRegisterSeed.json`)
Rebuild it from the Detailed Sheet with these fields per row:
- `owner_raw`, `owner_first`, `owner_last` (parsed from col B, stripping the `" - ..."` and parenthetical dog notes)
- `owner_mobile` (normalised, keep last 9 digits for matching)
- `dog_first`, `dog_surname`, `breed`, `size`, `sex`
- `days_per_week`, `pattern` (weekday codes)
- `dates`: array of ISO dates the dog is due in (the whole horizon, not just July)

### 2. Sharpen the reconciler matching
Extend the scorer in `DaycareImportPage.tsx` to weight, in order:
1. **Mobile match** (last 9 digits vs `customers.phone`) — near-certain, big score.
2. **Owner surname AND first name** — much stronger than the previous "surname substring" heuristic.
3. Dog first-name match (as today).

That should push the vast majority into the green "Auto" bucket. The Review/Unmatched/Create-new/Pick-pet UI stays as-is.

### 3. Commit step — bring the bookings in for real
For each confirmed / new row:

- **Enrolment**: unchanged — one active `daycare_enrolments` row per pet, plan matched by `days_per_week`, `selected_days` = pattern, `start_date` = 2026-07-01.
- **Attendance rows**: NEW — for every date in the row's `dates` array, insert a `daycare_attendance` row (`expected = true`, `status = 'expected'`). This is what makes the daycare board actually populated from day one. Idempotent: skip dates that already have a row for the pet.
- **July invoice**: unchanged — one draft invoice per customer for July 2026, one line per enrolled dog at the plan's monthly price.

### 4. No schema changes
Everything targets existing tables (`customers`, `pets`, `daycare_enrolments`, `daycare_attendance`, `invoices`, `invoice_items`). No migration needed.

## Result
After you hit **Commit import**, the daycare board will show real expected attendance every weekday from July onwards, drawn from Charlotte's sheet, plus enrolments and July invoices — the daycare system goes live.