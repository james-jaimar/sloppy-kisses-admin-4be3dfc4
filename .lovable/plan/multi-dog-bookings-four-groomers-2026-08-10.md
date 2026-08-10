# Multi-dog bookings + four groomers

## What changes for the owner

- **Four groomers.** Settings gets a "Groomers" screen to add/edit/deactivate groomers (name, colour, working hours). Each groomer becomes a real lane on the grooming board and calendar.
- **Choosing a groomer.** On a grooming booking (admin and portal) you pick Groomer 1-4 or leave it on **Auto-assign**, which drops the job on the next free groomer for that time. A client can be pinned to a preferred groomer, which pre-selects automatically.
- **Multi-dog grooming.** Select two or three dogs on one booking and the system creates one appointment per dog, priced per dog. Where two groomers are free it books them in parallel (both dogs at 09:00); otherwise it chains them back-to-back on the same groomer (09:00, then 10:00) using each dog's own package/treatment times. The chain shows as one group on the booking, the diary and the portal.
- **One bill.** Every dog in a group lands on the same invoice, one line set per dog, so the owner still gets a single invoice.
- **Hotel.** Two dogs on one stay already price as stay + extra-pet nights. What's added: a per-pet row in occupancy so each dog shows on its own line, a share-a-room vs separate-rooms choice, and per-pet feeding/medication notes and check-in/check-out ticks.
- **Daycare and transport.** Multi-pet quantities and per-pet attendance/collection rows so nothing is billed or checked in only once for two dogs.

## Technical detail

**Groomers**
- Seed four `resources` rows of type `inhouse_grooming` (keep the existing row as Groomer 1); add a preferred-groomer reference on the customer for "always groomer 2" requests.
- Settings CRUD at `/admin/settings/groomers`, permission-gated, following the existing rate-card settings pattern.
- `grooming_day_availability` already pools all active grooming resources, so per-groomer capacity comes free; extend its payload with the resource list and per-resource busy intervals so the picker can show which groomer is free.
- Auto-assign helper (`grooming_pick_resource(tenant, start, end)`): first free groomer by `sort_order`, honouring the customer's preferred groomer when free.

**Multi-dog grooming**
- Add `booking_group_id uuid` to `bookings`. One booking row per pet, all sharing the group id, each with its own `grooming_booking_details` (package, add-ons, instructions, duration) so pricing and instructions are per dog.
- Booking creation (admin `BookingFormModal` and portal `GroomingRequestWizard`) becomes per-pet: pick package/treatments per selected dog, compute each dog's duration, then lay them out — parallel where a second groomer is free at the same slot, else sequential.
- Portal `portal-create-booking` edge function: accept a per-pet grooming payload and create the group server-side, keeping all pricing server-side.
- Invoicing: route every booking in a group to the same invoice so the owner gets one document with a labelled line block per dog.
- Board, calendar, booking detail, Work Mode and portal booking detail show group siblings ("Dog 1 of 2") and support reschedule/cancel for one dog or the whole group.

**Hotel / daycare / transport multi-pet**
- Hotel: per-pet occupancy lanes, room-sharing flag, per-pet feeding/medication/labelling checklist items, per-pet check-in/out.
- Daycare: enrolment and attendance per pet, invoice quantity driven by pet count.
- Transport: per-pet collection ticks; the trip fee stays per trip, not per dog.

## Order of work

1. Groomers: resource seed, Settings CRUD, board/calendar lanes.
2. Groomer selection + auto-assign in admin and portal booking flows.
3. `booking_group_id` + per-pet grooming bookings, scheduling layout, single-invoice grouping.
4. Group-aware views: board, calendar, booking detail, Work Mode, portal.
5. Hotel per-pet lanes and checklists; daycare and transport per-pet handling.