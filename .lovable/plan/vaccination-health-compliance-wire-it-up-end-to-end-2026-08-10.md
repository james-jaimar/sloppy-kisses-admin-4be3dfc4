# Vaccination & health compliance — wire it up end to end

## What I found (verified)

- **Vaccination types set up**: dog = Rabies, Kennel Cough, 5-in-1; cat = Rabies, Snuffles. Parasite rules = Tick & flea, Deworming **and Kennel cough** — the duplicate you spotted.
- **Data mismatch that silently breaks the gate**: the per-service required list stores `5-in-1`, the vaccine type is `5_in_1`, and existing pet records use both `5_in_1` and `5 in 1`. The gate functions match on exact text, so 5-in-1 never resolves correctly.
- **Hotel and grooming** have a vaccination gate function and an on-screen panel on the booking detail page. **Daycare has none** — there is a "Block check-in for unvaccinated pets" setting in Daycare workflow, but nothing in the codebase reads it.
- **Admin booking form** shows parasite/health-hold warnings only, never vaccination status.
- **Customer record and customer list** show no compliance flag at all.
- **Customer portal** has a consent to-do card but no vaccination to-do.
- Certificates are stored as pet documents of type `vaccination`; nothing currently requires one.

## Rules to enforce (your answers)

- Valid = **expiry date on file AND a certificate** (photo/scan/PDF). Missing either = not compliant.
- **Customers are blocked** from booking any service when a required vaccination is missing, expired or uncertificated.
- **Staff see a red banner and can continue** with a logged override reason.
- Reminders at **30 days, 7 days, and on expiry**.
- Kennel cough removed from parasite treatments (stays a vaccination).

## Work

### 1. Clean the data
- Delete the kennel cough parasite rule; keep Tick & flea and Deworming.
- Normalise every vaccination code to one form (`rabies`, `kennel_cough`, `5_in_1`, `snuffles`) across vaccine types, per-service required rules and existing pet records.
- Make sure required rules cover every service: daycare, daycare assessment, hotel dog, hotel cat, in-house grooming, mobile grooming, transport — all editable in Settings.

### 2. One shared compliance check
- Replace the two near-identical hotel/grooming functions with a single `booking_vaccination_gate(booking_id)` used by all services, plus `pet_vaccination_status(pet_id, service_type, on_date)` for pet and customer screens.
- Both treat "no certificate on file" as non-compliant, and honour an existing admin waiver.

### 3. Enforcement points
- **Portal**: booking wizards (hotel, daycare, grooming, transport) show a per-pet checklist and refuse to submit while anything is outstanding, with a direct "upload now" link. The server-side booking function enforces the same rule so it can't be bypassed.
- **Admin booking form**: vaccination panel beside the existing health-gate warnings; red banner when something is outstanding, with an "Override and book" action that captures a reason.
- **Check-in / Work mode**: the same banner at arrival for daycare and hotel, so anything that lapsed between booking and arrival is caught. Daycare respects the "block check-in" setting.
- Every override is written to the activity log against the booking and the pet.

### 4. Visibility
- **Customer portal dashboard**: a "Certificates needed" to-do card listing each pet and each outstanding item, linking straight to the upload form (date administered + expiry + file). Stays visible until everything is clear.
- **Pet page (portal and admin)**: per-item status — Valid / Awaiting certificate / Expiring soon / Expired / Missing.
- **Admin customer record**: compliance chip in the header ("2 items outstanding") and a Health tab summarising every pet's vaccinations, parasite treatments and holds.
- **Admin customer and pet lists**: filter for "vaccinations outstanding" plus a warning icon on affected rows.

### 5. Reminders
- Scheduled job raises the existing `vax_expiring_30d`, `vax_expiring_7d` and `vax_expired` notification events per pet, respecting each customer's email preference and the global send lock.
- Editable message templates in Settings; events visible in the Comms inbox like everything else.

## Technical notes

- DB: drop kennel cough from `parasite_treatment_rules`; data fix on `vaccination_rules.vaccine_type` and `vaccinations.vaccination_type`; new functions `booking_vaccination_gate` and `pet_vaccination_status`; override columns on `bookings` (`vax_override_by`, `vax_override_reason`, `vax_override_at`).
- Certificate presence resolved from `documents` where `type = 'vaccination'` and `pet_id` matches; linked directly via `vaccinations.document_id` going forward.
- Frontend: shared `VaccinationGatePanel` replacing `HotelVaxGatePanel` and `GroomingVaxGatePanel`, reused by the admin booking form, booking detail, work mode and portal wizards.
- Reminder job runs daily via pg_cron through the existing `send-notifications` pipeline.