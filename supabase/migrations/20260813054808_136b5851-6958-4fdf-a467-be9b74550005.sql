ALTER TABLE public.message_templates
  ADD COLUMN IF NOT EXISTS body_format text NOT NULL DEFAULT 'text';

ALTER TABLE public.message_templates
  DROP CONSTRAINT IF EXISTS message_templates_body_format_check;

ALTER TABLE public.message_templates
  ADD CONSTRAINT message_templates_body_format_check CHECK (body_format IN ('text','html'));