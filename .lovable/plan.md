# Multiple dogs: grooming groomer choice + per-dog hotel accommodation

## 1. Grooming — parallel by default, or a chosen groomer

Multi-dog grooming already exists in both the admin booking form and the portal wizard: each dog gets its own appointment, and the scheduler runs them in parallel when a second groomer is free, otherwise chains them back-to-back. What is missing is the customer-side groomer choice.

Changes:
- Add a "Groomer" step to the portal grooming wizard (in-house only): **Any available groomer (fastest)** — the default — or a named groomer. Mobile grooming keeps van assignment as it is today.
- When a specific groomer is chosen, all of that customer's dogs are pinned to that groomer for the visit, so they run back-to-back rather than in parallel. The wizard shows the resulting times ("Doggy 09:00–10:00, Doggy 2 10:00–11:00") and warns when the day cannot fit them all.
- Remember a customer's preferred groomer and pre-select it next time; staff can set it on the customer record.
- The portal's booking function currently ignores the layout the wizard computed and picks a groomer itself. It will honour the per-dog groomer and time the wizard sends, re-validate availability server-side, and fall back to auto-assign if the slot was taken in the meantime.
- The admin booking form gets the same "Any available / specific groomer" control so front desk behaves identically; staff can still move one dog to another groomer afterwards from the grooming board.

## 2. Hotel — a different accommodation (and price) per dog

Today one stay has one accommodation type and every extra dog is billed at a flat extra-pet rate, so a Large dog in Hotel plus a small dog in the Puppy & Small Breeds Area cannot be quoted correctly.

Changes:
- Each dog on a stay gets its own accommodation choice, defaulted from that dog's size band, with a size-mismatch warning when a dog does not fit the chosen area.
- Pricing becomes one stay line per dog (accommodation name, nights, that area's nightly rate, peak uplift per rate card). The flat "extra pet in same room" line is retired for stays where dogs are in different areas; where two dogs are in the same area, that rate card's extra-pet rate still applies to the second dog.
- Applies everywhere a stay is priced: New quote drawer, admin hotel booking form, portal hotel wizard, quote PDF/email, and the invoice the booking generates.
- Occupancy and capacity count each dog against the area it is actually in, so the hotel board and availability checks stay correct.
- Existing bookings keep working: any stay without per-dog accommodation falls back to today's single-accommodation + extra-pet pricing.

Room sharing stays as-is — no share/separate toggle, since that facility does not exist.

## Technical notes

- `booking_pets` gains `accommodation_type text`, `rate_card_id uuid`, and `sort_order`; a matching per-pet payload is added to the quote extras JSON.
- `hotel_stay_lines` gains an overload taking a per-pet array (pet name + accommodation type). It emits one line per pet, applies peak uplift per rate card, and collapses same-area duplicates onto the existing extra-pet rate. The current 6-argument signature stays as the fallback path so `hotel_details_auto_invoice`, quote acceptance and the daycare/credit paths keep working.
- Hotel occupancy queries (`hotel_day_availability`, occupancy lanes) read `booking_pets.accommodation_type` with `hotel_booking_details.accommodation_type` as the fallback.
- Grooming: add `customers.preferred_groomer_resource_id`. The portal wizard passes `pets: [{pet_id, package_id, resource_id, start_at, end_at}]` to `portal-create-booking`, which re-checks each interval against `grooming_day_availability` before inserting the booking group.
- The groomer list for the portal comes from the existing `grooming_day_availability` RPC payload (`resources`), so no new customer-facing read on `resources` is needed.

## Order of work

1. Migration: `booking_pets` accommodation columns, `customers.preferred_groomer_resource_id`, per-pet `hotel_stay_lines`.
2. Hotel per-dog accommodation UI and pricing in the quote drawer, admin form and portal wizard; invoice/quote line generation.
3. Occupancy and capacity per area.
4. Portal groomer choice, server-side honouring of the per-dog plan, admin groomer control, preferred groomer on the customer record.