ALTER TABLE public.grooming_instruction_options
  ADD COLUMN IF NOT EXISTS no_action boolean NOT NULL DEFAULT false;

UPDATE public.grooming_instruction_options
SET no_action = true
WHERE lower(code) IN ('none','leave','no_shaving','no_trim','no_expression')
   OR lower(label) ~ '^(none|leave|no [a-z]+)';