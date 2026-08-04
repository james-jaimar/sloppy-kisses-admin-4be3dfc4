# Hotel booking form: fixed arrival/collection windows, per-pet care, and guidelines

## 1. Check-in and check-out become fixed windows, not free time entry

Today the admin modal asks for a raw date **and time** ("07/08/2026 21:45"), which lets staff book a 21:45 arrival. That goes away for hotel and cattery bookings.

- **Check-in:** date picker only. Time is fixed to the **09:00–11:00** window, shown as a single read-only chip. `start_at` is stored at 09:00 on the chosen date.
- **Check-out:** date derived from the nights stepper, with a two-way choice:
  - **Standard 09:00–09:30**
  - **Stay & Play 16:00–16:30** (extra fee) — picking this flags the booking as a late check-out and creates the Stay & Play session for the departure day, same as the existing Stay & Play flow, so it shows on the daycare board and gets charged.
- Sunday and public holiday departures only offer the 16:00–16:30 option (per the guidelines).
- Same rules on both the portal wizard and the admin modal, so the two can't disagree.

## 2. The duplicate "Hotel details" block is removed

The second screenshot is the old free-text hotel block still rendering above the new sections in the admin modal. It is removed for hotel/cattery bookings — accommodation type, check-in/out windows, transport, feeding, medication and belongings all live in the new sections. Nothing is lost; existing bookings' saved values are carried into the new fields.

## 3. Feeding, medication and grooming notes move per pet

The form's own layout is per pet, so we follow it. Each pet card gains:

- Feeding instructions
- Medication instructions
- Grooming notes / grooming requested for this pet

The single shared "Feeding instructions" / "Medication instructions" boxes are dropped. Booking-level care keeps only what is genuinely shared: belongings packed, emergency notes, anything else to share. Staff-facing views (booking detail card, hotel rounds, work mode) show each pet's feeding and medication under that pet's name.

## 4. The rest of the form and the hotel guidelines

Filling remaining gaps against the Word form:

- Vaccination dates per pet (5-in-1/DHPP, Rabies, Kennel Cough) plus tick & flea product and date — prefilled from the pet's vaccination records where we hold them, with a warning if Kennel Cough is less than **10 days** before arrival.
- Attachments checklist and the acknowledgement wording stay as-is.

**Hotel guidelines (page 3)** become a proper part of the flow:

- A "Hotel guidelines" step/panel shown before the acknowledgement in the portal wizard, and as a collapsible panel in the admin modal: what to pack, check-in/out hours, health & safety, trial days, updates & communication, identification, insurance, grooming 50% discount at check-in, viewings by appointment.
- The acknowledgement tick now reads as accepting the terms **and** the hotel guidelines, and the accepted guidelines version is stored with the submission.
- The guidelines text is editable by the owner under **Settings → Hotel & Cattery → Guidelines**, so wording changes do not need a developer.
- **Accommodation options** (Puppy Palace, Beachside Cabanas, City Deluxe Suites) show their descriptions inline in the room preference picker, sourced from each resource's description in Settings so the copy stays in one place.

## Technical notes

- `CHECK_IN_WINDOWS` / `CHECK_OUT_WINDOWS` stay the single source of truth; the date/time inputs derive `start_at` / `end_at` from the selected window rather than accepting arbitrary times.
- `FormPet` gains `feeding_instructions`, `medication_instructions`, `grooming_notes`, `grooming_required`; `AccommodationFormPayload` drops the booking-level feeding/medication fields (old submissions are read with a fallback so nothing breaks).
- `HotelFields` is no longer rendered by `BookingFormModal` for hotel/cattery; the mapping into `hotel_booking_details` (accommodation_type, windows, pickup/dropoff, belongings) is done from the accommodation payload on save.
- Stay & Play selection reuses `stay_play_sessions` and the existing grace/fee settings rather than a new mechanism.
- Guidelines text + version stored on `hotel_workflow_settings` with a Settings CRUD screen; version recorded in the form submission payload.