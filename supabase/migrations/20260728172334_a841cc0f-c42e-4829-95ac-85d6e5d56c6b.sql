ALTER TABLE public.pets
  ADD COLUMN IF NOT EXISTS size_override pet_size,
  ADD COLUMN IF NOT EXISTS size_override_reason text,
  ADD COLUMN IF NOT EXISTS size_override_by uuid REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS size_override_at timestamptz;

COMMENT ON COLUMN public.pets.size_override IS 'Staff-only grooming size override; when set this replaces size for grooming package selection and pricing.';