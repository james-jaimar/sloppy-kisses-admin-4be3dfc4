# Make the mobile groomer's brief visual, tickable and fully configurable

## What's confirmed today

- The Work Mode job page already shows the grooming brief (`JobBrief.tsx`), but purely as plain "Label: value" text rows — there are no icons or colours anywhere in the grooming instruction UI (admin included).
- The 26 instruction groups (Face, Teeth, Eyes, Eyebrows, Fringe, Body, Nails, Ears, Medical flags, etc.) live in `grooming_instruction_groups`; the table has no icon or colour column.
- Nothing records that the groomer actually *did* each brief item — the brief is read-only.
- The lower checklist is already template-driven and configurable: Settings → Job checklists (`/admin/settings/job-checklists`) has full CRUD per service, and `grooming_mobile` already has its own 7 steps. It just needs polish, not rebuilding.

## What will change

### 1. Brief becomes a visual, tick-off worklist (mobile groomer + in-house)

Each line of the grooming brief renders as a large touch card:

```text
[icon]  FACE            Neaten up            ( ✓ )
[icon]  TEETH           Gel only             ( ✓ )
[icon]  EYES            Trim                 ( ✓ )
```

- Colour-coded per group using existing semantic tokens (coral / turquoise / orange / green), with medical-flag lines pinned to the top in the alert tone.
- Tapping the tick marks that brief line as done, stamped with who and when; a header counter shows "4/9 done". Untick is allowed until the job is signed off.
- Progress is per booking (and per pet on multi-dog bookings), so it survives closing the phone.
- If the brief comes from the pet profile rather than the booking, it still ticks off and is labelled "From pet profile".
- "No preferences captured — call the office" warning stays as-is when there is nothing to show.
- Same component is used on in-house grooming jobs, so both groomer types get it.

### 2. Icons and colours are admin-configurable

- Settings → Grooming instructions gains an icon + colour picker per group, chosen from a curated set of Lucide icons (scissors, sparkles, eye, smile, paw, ear, brush, droplet, shield-alert, …) shown as a visual grid, not a text field.
- Sensible defaults are seeded for all existing groups so the screen looks right immediately, with no manual setup.
- Anything the owner adds later without an icon falls back to a neutral scissors icon.

### 3. Sign-off ties to the brief

- The job's Ready / Complete action shows how many brief lines are outstanding and asks for confirmation before finishing with unticked items (soft gate, not a hard block), so the groomer stays accountable without being locked out on site.

### 4. Checklist configurability polish

- Keep the existing Settings → Job checklists CRUD; add a short "used by Work mode" explainer, make the mobile grooming tab reachable in one tap, and surface the screen from the Grooming settings group too (currently only under the operations group).

## Technical notes

- Migration: add `icon` (text) and `colour` (text token key) to `grooming_instruction_groups`; backfill defaults per known code. New table `booking_brief_checks` (tenant_id, booking_id, pet_id, group_code, done, done_by, done_at, timestamps) with GRANTs, RLS scoped to tenant staff, and unique (booking_id, pet_id, group_code).
- New `src/features/grooming/instructions/briefIcons.ts` holding the curated Lucide icon map and colour token map, shared by settings and Work Mode.
- New `BriefChecklist.tsx` under `src/features/work/`; `JobGroomingBrief` in `JobBrief.tsx` switches from `<dl>` rows to it. Selection→label resolution reuses the existing `selectionLines` logic, extracted so it can be shared.
- New hooks in `src/features/grooming/instructions/queries.ts` for reading/toggling brief checks; optimistic toggle so taps feel instant on a phone.
- `GroomingInstructionsPage.tsx` gains the icon/colour picker; `useUpsertInstructionGroup` payload extended.
- Tests: label resolution + brief-check toggle logic.
