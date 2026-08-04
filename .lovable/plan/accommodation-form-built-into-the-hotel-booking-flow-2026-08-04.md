# Accommodation form built into the hotel booking flow

## What's there today (and why you can't find it)

The digital accommodation form exists, but it is a **separate page after the booking is made**: Customer portal → Bookings → open a hotel booking → orange "Complete form" banner → `/customer/bookings/:id/form`. On the admin side it only appears as a read-only summary card inside an existing hotel booking's detail panel.

So both screenshots you sent are correct — neither the portal wizard nor the admin "New booking" modal asks any of the form's questions. Nothing was wired into the booking creation flows.

## What to change

Make the accommodation form **part of booking a hotel/cattery stay**, on both sides, prefilled from records we already hold, so nobody re-types what we know.

### Portal — hotel wizard becomes 4 short steps

1. **Stay** — pets, dates, room preference, collection/drop-off required (+ collection address when ticked). Date entry switched from the raw calendar input to a compact day/month/year picker with quick "nights" stepper, so check-out follows check-in.
2. **Your details** — owner name, ID number, email, mobile, home address; emergency contact; vet name/number and medical aid. All prefilled from the customer record, editable inline; edits write back to the customer so we only ask once.
3. **Pet details** — one card per selected pet, prefilled from the pet record (breed, age, sex, size, colour/marks, behaviour ticks, sterilised/microchipped/vax status). Editable; edits write back to the pet record.
4. **Care & attachments** — feeding, medication, grooming requested, belongings, emergency notes, photo + vaccination card upload per pet, acknowledgement (full name + IP + timestamp, same signature style as consent).

Confirm booking then does one thing: create the confirmed booking **and** save the accommodation form against it. The post-booking banner stays only as a fallback for bookings made before this change or via phone.

### Admin — New booking modal

When service type is Hotel — dog / Hotel — cat, the current "Hotel details" block is replaced by the same sectioned form (owner / emergency / vet / per-pet / care / attachments), prefilled from the chosen customer and pets, collapsible so a quick phone booking can still be made in seconds. Sections that are already complete from the customer record show as a green "on file" summary row you can expand to edit.

Booking detail panel keeps the read-only summary card and gains an "Edit form" action that opens the same sections.

### Cleanups included

- Date/time picking replaced across both flows with the day picker + nights stepper.
- Collection / drop-off required is a visible tick with address, not buried.
- Missing-info chips: if vet, emergency contact, or vaccinations are absent, the booking shows an amber "needs info" chip for staff and prompts the customer.

## Technical notes

- Reuses `AccommodationFormPayload`, `submit_accommodation_form` RPC and `useAccommodationForm` — no schema change needed for the form itself.
- Prefill sources: `customers` (id_number, home_address, emergency_contact_*, vet_clinic_*), `pets` (breed, sex, size, marks_colour, behaviour_*, sterilised_status, microchipped, medical_aid_*).
- Write-back on submit: patch `customers` and `pets` with any edited values so the record improves over time.
- Portal submit sequence: `portal-create-booking` → `submit_accommodation_form` with the returned booking id, inside one mutation with a rollback message if step two fails.
- Photo / vax card uploads go through the existing S3 document pipeline, tagged to the pet and linked in the payload's attachments list.
- Shared form sections live in `src/features/hotelForm/` so portal and admin render identical fields.

## Open choices

- The form is presented as **required to confirm** on the portal, but admin can save a booking with it incomplete (staff often book by phone). Say the word if you want it hard-required on both sides.
