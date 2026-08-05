# Hotel stay + "grooming requested" → a real, schedulable groom

## The gap today

When a customer ticks "Grooming requested for this pet" during a hotel booking, the tick is only stored as text on the hotel booking (`hotel_booking_details.grooming_required` / per-pet `grooming_required` + `grooming_notes` inside the accommodation form JSON). Nothing creates a grooming booking, nothing appears on the grooming board, no one is told to schedule it, and it never gets invoiced. It is effectively a note that can be missed.

## What to build

A lightweight "grooming request" record that lives between the tick and a real grooming booking, plus the staff workflow to turn one into the other.

### 1. Request records (per pet)

A new `hotel_grooming_requests` table: tenant, hotel booking, pet, customer, the requested window (the stay's check-in → check-out dates), the customer's notes, status (`pending`, `scheduled`, `declined`, `cancelled`), and a link to the grooming booking once created.

Rows are created automatically whenever a hotel booking is made or its accommodation form is submitted/updated with grooming ticked for a pet — from the portal wizard, the admin booking modal, or the form. Un-ticking cancels a still-pending request.

### 2. Staff scheduling action

On the hotel booking detail page, a "Grooming requested" panel lists each pet's request with the customer's notes and a **Schedule groom** action. Scheduling opens the existing grooming slot picker, constrained to days inside the stay window (with checkout day highlighted, since checkout-day grooms already carry the discount), plus package/size selection using the existing grooming rate card and pet size/override rules.

Confirming creates a normal grooming booking (own booking number, `grooming_booking_details`, resource/groomer, appears on the grooming board and calendar like any other groom), links it back to the request, marks the request `scheduled`, and invoices it the normal way — appended to the hotel stay's invoice rather than a separate one, and with the checkout-day discount applied automatically when the chosen slot falls on the checkout date.

Staff can also **Decline** a request with a reason (fully booked), which records the reason and stops it nagging.

### 3. Making it impossible to miss

- A **Grooming to schedule** queue: pending requests for upcoming/current stays, oldest stay first, reachable from the hotel board and the front-desk home launcher tile with a live count.
- A sidebar badge count on Hotel (reusing the existing dynamic badge hook).
- A "Groom requested — not yet scheduled" flag on the hotel booking row, the occupancy grid pet lane, and the daily hotel rounds view, so kennel staff see it.
- On the resulting grooming card, a marker showing it belongs to an in-house hotel guest (pet comes from a kennel, not the front door) so the groomer knows the dog is already on site.

### 4. Customer side

The portal booking detail shows the grooming request status: "Requested — we'll confirm a time", then the confirmed date/time once scheduled, or the decline reason. Optional notification event on scheduling so the customer is told when the groom will happen.

## Technical notes

- Migration: `hotel_grooming_requests` (with GRANTs + RLS mirroring existing tenant-scoped booking tables), a trigger/RPC to sync requests from hotel booking + accommodation form submissions, and an index on (tenant, status, stay dates).
- Scheduling runs through one RPC (`schedule_hotel_groom`) so portal and admin behave identically and the booking/invoice/discount logic lives in one place; it reuses the existing grooming pricing helpers and `grooming_day_availability`.
- Reuses existing components: `GroomingSlotPicker`, grooming rate-card queries, `useNavBadges`, hotel occupancy lanes.
- Default assumptions, easy to change: grooming for hotel guests is charged on the hotel invoice (not prepaid at booking), and staff — not the customer — pick the slot.
