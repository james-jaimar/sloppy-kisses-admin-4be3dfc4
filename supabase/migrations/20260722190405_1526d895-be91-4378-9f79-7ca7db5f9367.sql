-- Sprint 7: add T-24h booking reminder event value
ALTER TYPE public.notification_event_type ADD VALUE IF NOT EXISTS 'booking_reminder_24h';
