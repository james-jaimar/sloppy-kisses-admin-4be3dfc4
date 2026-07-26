ALTER TABLE public.hotel_rate_cards
  ADD COLUMN IF NOT EXISTS min_size_band public.pet_size,
  ADD COLUMN IF NOT EXISTS max_size_band public.pet_size;