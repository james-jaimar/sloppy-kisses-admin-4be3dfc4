
-- 1) Extend notification enums
ALTER TYPE public.notification_event_type ADD VALUE IF NOT EXISTS 'invoice_issued';
ALTER TYPE public.notification_event_type ADD VALUE IF NOT EXISTS 'invoice_reminder';
ALTER TYPE public.notification_event_type ADD VALUE IF NOT EXISTS 'invoice_paid';
ALTER TYPE public.notification_event_type ADD VALUE IF NOT EXISTS 'vax_expiring_30d';
ALTER TYPE public.notification_event_type ADD VALUE IF NOT EXISTS 'vax_expiring_7d';
ALTER TYPE public.notification_event_type ADD VALUE IF NOT EXISTS 'vax_expired';
ALTER TYPE public.notification_event_type ADD VALUE IF NOT EXISTS 'manual_message';

-- Channel enum
DO $$ BEGIN
  CREATE TYPE public.comms_channel AS ENUM ('email','whatsapp','sms');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2) Extend notification_events with dispatcher fields
ALTER TABLE public.notification_events
  ADD COLUMN IF NOT EXISTS channel public.comms_channel NOT NULL DEFAULT 'email',
  ADD COLUMN IF NOT EXISTS invoice_id uuid REFERENCES public.invoices(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS pet_id uuid REFERENCES public.pets(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS recipient_email text,
  ADD COLUMN IF NOT EXISTS recipient_phone text,
  ADD COLUMN IF NOT EXISTS subject text,
  ADD COLUMN IF NOT EXISTS body_rendered text,
  ADD COLUMN IF NOT EXISTS template_key text,
  ADD COLUMN IF NOT EXISTS provider_message_id text,
  ADD COLUMN IF NOT EXISTS scheduled_for timestamptz,
  ADD COLUMN IF NOT EXISTS attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS notification_events_dispatch_idx
  ON public.notification_events (status, scheduled_for)
  WHERE status = 'pending';

DROP TRIGGER IF EXISTS set_notification_events_updated_at ON public.notification_events;
CREATE TRIGGER set_notification_events_updated_at
  BEFORE UPDATE ON public.notification_events
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 3) message_templates
CREATE TABLE IF NOT EXISTS public.message_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  event_code text NOT NULL,
  channel public.comms_channel NOT NULL DEFAULT 'email',
  name text NOT NULL,
  subject text,
  body text NOT NULL,
  send_to text NOT NULL DEFAULT 'customer',
  is_active boolean NOT NULL DEFAULT true,
  auto_send boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, event_code, channel)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.message_templates TO authenticated;
GRANT ALL ON public.message_templates TO service_role;
ALTER TABLE public.message_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant read templates" ON public.message_templates FOR SELECT TO authenticated
  USING (public.user_has_tenant_access(tenant_id));
CREATE POLICY "manage templates" ON public.message_templates FOR INSERT TO authenticated
  WITH CHECK (public.user_has_permission(tenant_id, 'settings.comms.manage'));
CREATE POLICY "update templates" ON public.message_templates FOR UPDATE TO authenticated
  USING (public.user_has_permission(tenant_id, 'settings.comms.manage'))
  WITH CHECK (public.user_has_permission(tenant_id, 'settings.comms.manage'));
CREATE POLICY "delete templates" ON public.message_templates FOR DELETE TO authenticated
  USING (public.user_has_permission(tenant_id, 'settings.comms.manage'));
CREATE TRIGGER set_message_templates_updated_at BEFORE UPDATE ON public.message_templates
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 4) comms_settings
CREATE TABLE IF NOT EXISTS public.comms_settings (
  tenant_id uuid PRIMARY KEY REFERENCES public.tenants(id) ON DELETE CASCADE,
  from_name text NOT NULL DEFAULT 'Sloppy Kisses',
  from_email text NOT NULL DEFAULT 'noreply@example.com',
  reply_to text,
  whatsapp_from text,
  sms_from text,
  quiet_start time NOT NULL DEFAULT '20:00',
  quiet_end time NOT NULL DEFAULT '07:00',
  timezone text NOT NULL DEFAULT 'Africa/Johannesburg',
  test_recipient text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.comms_settings TO authenticated;
GRANT ALL ON public.comms_settings TO service_role;
ALTER TABLE public.comms_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant read comms settings" ON public.comms_settings FOR SELECT TO authenticated
  USING (public.user_has_tenant_access(tenant_id));
CREATE POLICY "manage comms settings insert" ON public.comms_settings FOR INSERT TO authenticated
  WITH CHECK (public.user_has_permission(tenant_id, 'settings.comms.manage'));
CREATE POLICY "manage comms settings update" ON public.comms_settings FOR UPDATE TO authenticated
  USING (public.user_has_permission(tenant_id, 'settings.comms.manage'))
  WITH CHECK (public.user_has_permission(tenant_id, 'settings.comms.manage'));
CREATE TRIGGER set_comms_settings_updated_at BEFORE UPDATE ON public.comms_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 5) vaccination_rules
CREATE TABLE IF NOT EXISTS public.vaccination_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  service_type public.service_type NOT NULL,
  vaccine_type text NOT NULL,
  species text NOT NULL DEFAULT 'dog',
  grace_days integer NOT NULL DEFAULT 0,
  required boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, service_type, vaccine_type, species)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.vaccination_rules TO authenticated;
GRANT ALL ON public.vaccination_rules TO service_role;
ALTER TABLE public.vaccination_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant read vax rules" ON public.vaccination_rules FOR SELECT TO authenticated
  USING (public.user_has_tenant_access(tenant_id));
CREATE POLICY "manage vax rules insert" ON public.vaccination_rules FOR INSERT TO authenticated
  WITH CHECK (public.user_has_permission(tenant_id, 'settings.vaccination.manage'));
CREATE POLICY "manage vax rules update" ON public.vaccination_rules FOR UPDATE TO authenticated
  USING (public.user_has_permission(tenant_id, 'settings.vaccination.manage'))
  WITH CHECK (public.user_has_permission(tenant_id, 'settings.vaccination.manage'));
CREATE POLICY "manage vax rules delete" ON public.vaccination_rules FOR DELETE TO authenticated
  USING (public.user_has_permission(tenant_id, 'settings.vaccination.manage'));
CREATE TRIGGER set_vax_rules_updated_at BEFORE UPDATE ON public.vaccination_rules
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 6) bookings override columns
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS vax_override_reason text,
  ADD COLUMN IF NOT EXISTS vax_override_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS vax_override_at timestamptz;

-- 7) Permissions
INSERT INTO public.permissions (code, label, description) VALUES
  ('comms.view', 'View comms inbox', 'See outgoing and sent notification events'),
  ('comms.send', 'Send messages', 'Manually send a message from a template'),
  ('settings.comms.manage', 'Manage comms settings', 'Manage message templates, sender identity, quiet hours'),
  ('settings.vaccination.manage', 'Manage vaccination rules', 'Configure per-service vaccination requirements'),
  ('bookings.override_vax', 'Override vaccination block', 'Allow creating/confirming a booking despite missing/expired vaccines'),
  ('pets.manage_vaccinations', 'Manage vaccinations', 'Add, edit and verify pet vaccination records')
ON CONFLICT (code) DO NOTHING;

-- Grant new perms to any role that already has settings.daycare.manage (Owner/Admin path)
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT DISTINCT rp.role_id, p.id
FROM public.role_permissions rp
JOIN public.permissions existing ON existing.id = rp.permission_id AND existing.code = 'settings.daycare.manage'
CROSS JOIN public.permissions p
WHERE p.code IN ('comms.view','comms.send','settings.comms.manage','settings.vaccination.manage','bookings.override_vax','pets.manage_vaccinations')
ON CONFLICT DO NOTHING;

-- Grant comms.view/comms.send/pets.manage_vaccinations to any role with bookings.manage (operator path)
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT DISTINCT rp.role_id, p.id
FROM public.role_permissions rp
JOIN public.permissions existing ON existing.id = rp.permission_id AND existing.code = 'bookings.manage'
CROSS JOIN public.permissions p
WHERE p.code IN ('comms.view','comms.send','pets.manage_vaccinations')
ON CONFLICT DO NOTHING;

-- 8) Seed default comms_settings and starter templates per tenant
INSERT INTO public.comms_settings (tenant_id, from_name)
SELECT t.id, coalesce(t.name, 'Sloppy Kisses') FROM public.tenants t
ON CONFLICT (tenant_id) DO NOTHING;

INSERT INTO public.message_templates (tenant_id, event_code, channel, name, subject, body, send_to, auto_send)
SELECT t.id, x.event_code, 'email'::public.comms_channel, x.name, x.subject, x.body, 'customer', true
FROM public.tenants t
CROSS JOIN (VALUES
  ('booking_created','Booking confirmation','Booking {{booking.booking_number}} confirmed','Hi {{customer.first_name}},

Your booking {{booking.booking_number}} for {{pet.name}} on {{booking.start_at}} is confirmed.

Thanks,
{{tenant.name}}'),
  ('booking_cancelled','Booking cancelled','Booking {{booking.booking_number}} cancelled','Hi {{customer.first_name}},

Your booking {{booking.booking_number}} has been cancelled.

Thanks,
{{tenant.name}}'),
  ('booking_rescheduled','Booking rescheduled','Booking {{booking.booking_number}} rescheduled','Hi {{customer.first_name}},

Your booking {{booking.booking_number}} has been moved to {{booking.start_at}}.

Thanks,
{{tenant.name}}'),
  ('invoice_issued','Invoice issued','Invoice {{invoice.number}} from {{tenant.name}}','Hi {{customer.first_name}},

Please find invoice {{invoice.number}} for {{invoice.total}}.

Thanks,
{{tenant.name}}'),
  ('invoice_reminder','Invoice reminder','Reminder: invoice {{invoice.number}} outstanding','Hi {{customer.first_name}},

A friendly reminder that invoice {{invoice.number}} for {{invoice.balance}} is still outstanding.

Thanks,
{{tenant.name}}'),
  ('vax_expiring_30d','Vaccination expiring soon','{{pet.name}}''s vaccinations expire soon','Hi {{customer.first_name}},

{{pet.name}}''s {{vaccine.type}} vaccination expires on {{vaccine.expires_on}}. Please book a booster before your next visit.

Thanks,
{{tenant.name}}'),
  ('vax_expired','Vaccination expired','{{pet.name}}''s vaccinations have expired','Hi {{customer.first_name}},

{{pet.name}}''s {{vaccine.type}} vaccination expired on {{vaccine.expires_on}}. Please update before the next visit.

Thanks,
{{tenant.name}}')
) AS x(event_code, name, subject, body)
ON CONFLICT (tenant_id, event_code, channel) DO NOTHING;

-- 9) Seed vaccination_rules defaults per tenant
INSERT INTO public.vaccination_rules (tenant_id, service_type, vaccine_type, species, grace_days, required)
SELECT t.id, s.service_type::public.service_type, s.vaccine_type, s.species, 0, true
FROM public.tenants t
CROSS JOIN (VALUES
  ('daycare','rabies','dog'),
  ('daycare','5-in-1','dog'),
  ('daycare','kennel_cough','dog'),
  ('hotel_dog','rabies','dog'),
  ('hotel_dog','5-in-1','dog'),
  ('hotel_dog','kennel_cough','dog'),
  ('hotel_cat','rabies','cat'),
  ('hotel_cat','snuffles','cat'),
  ('grooming_inhouse','rabies','dog'),
  ('grooming_mobile','rabies','dog')
) AS s(service_type, vaccine_type, species)
ON CONFLICT DO NOTHING;
