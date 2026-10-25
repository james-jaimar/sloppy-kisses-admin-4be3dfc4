# Roadmap — Hotel booking walkthrough fixes

All slices complete (25 Oct 2026):

- [x] Slice 1: Walks/extras auto-scale when pet count changes on an existing booking (HotelExtrasPanel scales "total" quantities + staff notice)
- [x] Slice 2: Mixed dog/cat bookings — species emoji on pet chips; cats no longer default into dog rate cards (panel + save fallback)
- [x] Slice 3: Species-aware rates — per-pet accommodation filters by species; save path falls back to the pet's own species rate card
- [x] Slice 4: Walks are dog-only on mixed stays — priceHotelExtras takes dogCount; portal booking/quote + wizard pass it; test added
- [x] Slice 5: Pet-specific grooming on hotel stays — already per-pet via hotel_grooming_requests.pet_id (verified)
- [x] Slice 6: Partial pet removal on a booking with an issued invoice warns staff to raise a credit note (DB already flags invoice_review_needed)
- [x] Slice 7: Cat carrier notice shown when a hotel stay with a cat requests van collection/drop-off
- [x] Slice 8: Mixed-stay invoices now price each species against its own rate card (hotel_stay_lines_pets groups by species + accommodation)
