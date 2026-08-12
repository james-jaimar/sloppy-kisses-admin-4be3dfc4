# Flag grooming appointments with no styling preferences

## What I checked

Grooming preferences live in two places: `pet_grooming_defaults` (the pet's standing preferences) and `grooming_booking_instructions` (what was agreed for this specific appointment). Both are optional today, and nothing on the board, diary or booking card tells front desk when they are empty — so the groomer only finds out at the table.

## What I'll build

### 1. A "Prefs" status chip everywhere grooming appointments appear
Three states, computed per booking:
- **Prefs missing** (amber/alert) — no booking instructions and no pet defaults.
- **From pet profile** (neutral) — no booking instructions, but the pet has saved defaults that will be used.
- **Prefs set** (quiet green tick) — instructions captured for this appointment.

Shown on:
- Grooming board cards (kanban) and diary blocks
- Booking detail page header
- Work Mode grooming job card
- Pet detail page grooming section (pet has no defaults at all)

### 2. Set them straight from the board
Clicking the "Prefs missing" chip opens the existing grooming instructions form in a modal for that booking — pre-seeded from the pet's defaults if any — with a "Also save as this pet's defaults" tick. Front desk can capture what the owner says on the phone without leaving the board, and it stays permission-gated the same way the booking edit is.

### 3. A "Preferences outstanding" worklist
A small counter on the grooming board header ("3 upcoming grooms without preferences") that filters the day/week to just those, so front desk can work the list ahead of time.

### 4. Ask the owner
On the same modal, a "Request from customer" action that queues the existing notification pipeline with a link to the pet's grooming preferences page in the portal, so the owner can fill it in themselves.

## Technical notes

- New hook fetching `grooming_booking_instructions` + `pet_grooming_defaults` for the day's bookings in two batched queries, exposing a `prefsState` per booking; used by board, diary and detail page.
- New `GroomingPrefsChip` component and `BookingGroomingPrefsDialog` wrapping the existing `BookingGroomingInstructionsPanel` and `useSaveBookingInstructions` / `useSavePetGroomingDefaults`.
- No schema changes. The customer request uses the existing `notification_events` flow with a new template code.
