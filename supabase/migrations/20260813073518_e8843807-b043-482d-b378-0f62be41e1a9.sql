CREATE TABLE public.hotel_quote_email_settings (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade unique,
  hero_label text not null default 'Hotel quote {{quote.number}}',
  hero_headline text not null default 'A holiday for {{pet.names}}',
  total_label text not null default 'Total for the stay',
  deposit_label text not null default '50% deposit to secure',
  hold_line text not null default 'These dates are held for you until {{quote.valid_until}}.',
  cta_label text not null default 'Accept this quote',
  cta_subtext text not null default 'Prefer to chat? Just reply to this email.',
  section_heading text not null default 'Everything you need before the stay',
  cards jsonb not null default '[]'::jsonb,
  signoff_html text not null default '<p>We can''t wait to spoil {{pet.names}}.</p><p>Warmly,<br/><strong>The {{tenant.name}} team</strong></p>',
  show_guidelines boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.hotel_quote_email_settings TO authenticated;
GRANT ALL ON public.hotel_quote_email_settings TO service_role;

ALTER TABLE public.hotel_quote_email_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY hotel_quote_email_settings_select ON public.hotel_quote_email_settings
  FOR SELECT TO authenticated USING (user_has_tenant_access(tenant_id));
CREATE POLICY hotel_quote_email_settings_insert ON public.hotel_quote_email_settings
  FOR INSERT TO authenticated WITH CHECK (user_has_permission(tenant_id, 'settings.hotel.manage'));
CREATE POLICY hotel_quote_email_settings_update ON public.hotel_quote_email_settings
  FOR UPDATE TO authenticated USING (user_has_permission(tenant_id, 'settings.hotel.manage'))
  WITH CHECK (user_has_permission(tenant_id, 'settings.hotel.manage'));
CREATE POLICY hotel_quote_email_settings_delete ON public.hotel_quote_email_settings
  FOR DELETE TO authenticated USING (user_has_permission(tenant_id, 'settings.hotel.manage'));

CREATE TRIGGER hotel_quote_email_settings_updated_at
  BEFORE UPDATE ON public.hotel_quote_email_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();