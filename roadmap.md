# Roadmap — Hotel booking walkthrough fixes

- [x] Slice 1: Walks/extras auto-scale when pet count changes on an existing booking (HotelExtrasPanel scales "total" quantities + staff notice)
- [x] Slice 2: Mixed dog/cat bookings — staff pet picker already lists all species; added species emoji on chips; cats no longer default into dog rate cards (panel + save fallback)
- [x] Slice 3: Species-aware rates/room allocation — per-pet accommodation select already filters by species; save path now falls back to the pet's own species rate card
- [x] Slice 4: Walks are dog-only on mixed stays — priceHotelExtras takes dogCount; portal booking/quote + wizard pass it; test added
- [ ] Slice 5: Pet-specific grooming on hotel stays — verify hotel_grooming_requests is per-pet
- [ ] Slice 6: Partial pet cancellation with credit notes
- [ ] Slice 7: Transport carrier logistics for mixed stays
- [ ] Slice 8: Grouped dog/cat invoice lines
