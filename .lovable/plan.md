# Terms & Conditions audit — what the system already enforces, and what's missing

The PDF read cleanly (real text, not a scan). I mapped every operational rule in it against the
database and the app. Below: what's already built, what's half-built (a setting exists but nothing
enforces it), what's missing entirely — then a build order.

## 1. Already covered (rule → where it lives)

| T&C rule | Where it's handled |
| --- | --- |
| Daycare billed monthly in advance (run 22nd, due 1st) | `invoicing_settings`: cycle `monthly_prepaid`, run day 22, due day 1 |
| 3% per month interest on overdue accounts | `policy_settings.overdue_interest_percent_per_month = 3` + `charge_overdue_interest()` |
| Hotel 50% deposit, balance 1 month before, cancel cutoff 1 month | `policy_settings` (50 / 30 days / 30 days) + the deposit-split hotel flow |
| Hotel check-in/out windows, Stay & Play late checkout at a fee | `hotel_workflow_settings` + the Stay & Play workflow |
| Grooming cancellations inside 24h charged | `policy_settings.grooming_cancellation_hours = 24` + `apply_cancellation_fee()` |
| Vaccinations must be current, blocking or warning per service | `vaccine_types`, `vaccination_rules`, per-service `vax_gate_mode` |
| Photo consent and publishing rights | consent wizard + `customer_consents`, photo gate per service |
| Emergency vet authorisation, vet on file, owner pays vet costs | consent wizard, `vets`, `incidents` |
| Behaviour/medical flags on the pet (aggression history, power breed, sterilised, microchip, medical aid) | `pets` columns already exist |
| Daycare: 1 calendar month written notice, pro-rata | `policy_settings.daycare_notice_months` + `daycare_notice_quote()` |
| T&C versioning and acceptance record | `tenant_terms_versions` (2 versions loaded), `customer_consents` |

## 2. Half-built — the setting exists but nothing enforces it

1. **Hotel booking amendments** — `hotel_free_amendments = 1` and `hotel_amendment_fee = R150` are stored, but no code counts changes or raises the fee.
2. **Daycare catch-up days** — `daycare_catchup_window_days = 30` is stored, but there is no catch-up credit at all: missed public-holiday or illness days aren't tracked, granted, expired, or redeemable.
3. **Closures** — the `closures` table and `is_closed()` exist but the table is **empty**: no SA public holidays, no December 10-working-day shutdown. Nothing blocks bookings on closed days today.
4. **Tick/flea, deworming, kennel cough schedule** — `pet_parasite_treatments` exists but has **zero rows**, with no due dates, reminders, or arrival gate.
5. **Signed T&C** — two versions are loaded, but **no customer has accepted any version yet**, and the 30-day grace period isn't visible to staff anywhere.
6. **Power breeds** — `pets.is_power_breed` exists, but nothing warns or blocks at booking, and `dog_breeds` has no power-breed flag to set it automatically.
7. **Day swaps** — the app supports `daycare_day_swaps`, but clause 12.7 says days may **not** be swapped and missed days are forfeited. These conflict; needs your call.

## 3. Missing entirely

1. **Late collection** — no late-pickup fee after 17h30, and no "converts to overnight boarding + food" path (clauses 7.1, 7.3, 8).
2. **Abandonment** — no 48-hour abandonment flag or escalation.
3. **Tick/flea treatment on arrival at a fee** when proof is missing (clause 6.1).
4. **Annual ~10% January increase** — no bulk uplift tool across daycare plans, hotel rate cards, grooming packages and add-ons.
5. **On heat / contagious illness** — no "not fit to attend" state and no vet clearance certificate required before return.
6. **Assessment gate** — a daycare-assessment service exists, but new enrolments aren't required to pass one (clause 9.2).
7. **Transport rules** — no 20 km radius check, no "gate code before 07h00" prompt, no failed-collection (nobody home) charge.
8. **Hotel photo policy** — evening-only social posting and never sending photos to individual clients isn't expressed anywhere.
9. **Grooming extras from the T&C** — sedation fasting instruction (no food after 10pm), Olivedale vet location, senior-pet vet check, and the 4–6 week rebook nudge.
10. **Boarding logistics** — owner-supplied food/medication in labelled bags, and charging extra Deli food at check-out.
11. **Early hotel checkout = no refund** — not enforced on the invoice.

## 4. Proposed build order

**Phase 1 — money and dates (where revenue leaks today)**
- Closure calendar: load SA public holidays plus the December shutdown, block bookings on closed days, manage them in Settings.
- Daycare catch-up credits: auto-issue when a booked day falls on a closure or is missed with a vet clearance; 30-day expiry; redeemable when booking a day; everything else forfeits.
- Hotel amendment counter: first change free, R150 after that, added to the invoice automatically.
- Late collection: after-hours fee plus a one-tap "convert to overnight boarding" that adds boarding and food lines.
- Annual increase tool: percentage uplift with preview and effective date, applied across all rate cards.

**Phase 2 — health and safety gates**
- Parasite / deworming / kennel-cough schedule per pet with due dates, portal reminders, and an arrival gate.
- Missing tick/flea proof triggers a chargeable on-arrival treatment.
- "Not fit to attend" states (on heat, contagious illness) cleared only by an uploaded vet clearance certificate.
- Power-breed flag on breeds, auto-applied to pets, warning at booking; assessment required before a new daycare enrolment goes active.

**Phase 3 — service-specific rules**
- Transport: 20 km radius check against the verified address, gate-code-by-07h00 prompt, failed-collection charge.
- Grooming: sedation fasting and vet-location instructions on booking and confirmation, senior-pet vet check flag, 4–6 week rebook nudge.
- Hotel: food/medication labelling checklist at check-in, Deli extra-food charge at check-out, no refund on early checkout, photo-policy note.

**Phase 4 — paperwork**
- Force T&C acceptance in the portal with the grace-day countdown, and a staff list of unsigned customers.
- Abandonment tracker at 48 hours with escalation notes.

Every item ships with its own Settings screen or fields, so Charlotte can change fees, windows and
thresholds without a developer.

## Technical notes

- Likely new tables: `daycare_catchup_credits`, `booking_amendments` (or a counter on `bookings`), `pet_health_holds`, plus a power-breed flag on `dog_breeds`.
- Extend `policy_settings` with: late-pickup fee, after-hours boarding conversion rate, failed-collection fee, transport radius km, on-arrival parasite treatment fee, abandonment hours.
- Closure seeding is data, not schema: a South African public-holiday set per year plus a configurable December range.
- The day-swap conflict (clause 12.7 versus the existing swap feature) needs a decision before Phase 1 lands.