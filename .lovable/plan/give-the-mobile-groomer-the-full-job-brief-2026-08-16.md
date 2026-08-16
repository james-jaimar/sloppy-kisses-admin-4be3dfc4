# Give the mobile groomer the full job brief

Right now the Work Mode job page (`/work/job/:id`) shows only the pet name, breed, owner name, status, checklist, photos and notes. Everything the groomer actually needs to do the groom — styling preferences, add-ons, vaccination warnings, health flags, the address to drive to — lives on the admin booking page and is never fetched in Work Mode. Same page is used by in-house and mobile grooming, so both benefit.

## What the job page will show

Header (unchanged position, more detail):
- Pet name, breed, size (including any staff size override), sex/age if present
- Owner name, tap-to-call, and tap-to-WhatsApp
- Date/time, status pill, resource (van/station)

New sections, ordered so the most safety-critical is first:

1. **Alerts** — vaccination gate warnings for this booking (expired / missing / awaiting certificate), health holds and behaviour/medical flags. Red/amber card, same wording as admin so nothing gets lost in translation.
2. **Where** (mobile grooming only) — full formatted address incl. unit/complex and gate code/access notes, with an "Open in Maps" button.
3. **Grooming brief** — the styling instructions for this booking: each instruction group and the chosen option(s), medical flags, free-text notes, and "told office to call". If the booking has no instructions saved, it falls back to the pet's saved grooming defaults and is labelled "From pet profile". If neither exists, it shows a clear "No preferences captured — call the office" warning rather than an empty box.
4. **Service & add-ons** — package/service name, duration, add-ons on the booking, Stay & Play flag, and the mobile travel fee line so the groomer knows what was sold.
5. Existing checklist, photos, notes, incident button stay as they are.

Everything in these new sections is read-only in Work Mode; edits still happen on the admin side.

## Technical notes

- Extend `useWorkJob` in `src/features/work/queries.ts` to also select: `grooming_booking_details` (package, duration, travel fee, notes), `grooming_booking_addons` with add-on names, pet fields (size, size_override, sex, dob, medical/behaviour notes), customer mobile, and the booking's service address / `customer_addresses` row.
- Reuse existing hooks rather than re-implementing: `useBookingVaccinationGate` (`src/features/pets/vaccinationGate.ts`), `useBookingInstructions` + `usePetGroomingDefaults` + `useInstructionCatalog` (`src/features/grooming/instructions/queries.ts`) to turn stored selection keys into human labels, and the address formatter in `src/lib/address/format.ts`.
- Add a presentational `JobBrief.tsx` under `src/features/work/` holding the alert, address, brief and service cards; `JobPage.tsx` renders it for grooming services (`isGroomingService`) and renders the alert + address cards for transport jobs too.
- Keep tablet/phone ergonomics: large tap targets, collapsible cards defaulting open for alerts and the grooming brief.
