
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS reminders_paused boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS last_reminder_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_reminder_offset integer;

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;
