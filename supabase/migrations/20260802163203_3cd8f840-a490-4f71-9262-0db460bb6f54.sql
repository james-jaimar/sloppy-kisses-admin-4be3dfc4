
-- ============ ENUMS ============
create type public.incident_severity as enum ('note','concern','urgent');
create type public.incident_category as enum ('vet','injury','escape','behaviour','illness','other');
create type public.incident_state as enum ('open','acknowledged','resolved');
create type public.booking_photo_kind as enum ('before','after','incident','general');
create type public.care_round_kind as enum ('fed_am','fed_pm','meds','walk','play','crate_clean','other');

-- ============ job_checklist_templates ============
create table public.job_checklist_templates (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  service_type public.service_type not null,
  label text not null,
  icon_key text,
  sort_order integer not null default 0,
  requires_note boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index job_checklist_templates_tenant_idx on public.job_checklist_templates(tenant_id, service_type, sort_order);
grant select, insert, update, delete on public.job_checklist_templates to authenticated;
grant all on public.job_checklist_templates to service_role;
alter table public.job_checklist_templates enable row level security;
create policy "checklist templates readable by tenant staff"
  on public.job_checklist_templates for select to authenticated
  using (public.user_has_tenant_access(tenant_id));
create policy "checklist templates managed by settings managers"
  on public.job_checklist_templates for all to authenticated
  using (public.user_has_permission(tenant_id, 'settings.manage'))
  with check (public.user_has_permission(tenant_id, 'settings.manage'));
create trigger job_checklist_templates_updated_at before update on public.job_checklist_templates
  for each row execute function public.set_updated_at();

-- ============ booking_checklist_items ============
create table public.booking_checklist_items (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  booking_id uuid not null references public.bookings(id) on delete cascade,
  template_id uuid references public.job_checklist_templates(id) on delete set null,
  label text not null,
  sort_order integer not null default 0,
  done boolean not null default false,
  done_by uuid references public.profiles(id) on delete set null,
  done_at timestamptz,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index booking_checklist_items_booking_idx on public.booking_checklist_items(booking_id, sort_order);
grant select, insert, update, delete on public.booking_checklist_items to authenticated;
grant all on public.booking_checklist_items to service_role;
alter table public.booking_checklist_items enable row level security;
create policy "booking checklist readable by tenant staff"
  on public.booking_checklist_items for select to authenticated
  using (public.user_has_tenant_access(tenant_id));
create policy "booking checklist writable by booking updaters"
  on public.booking_checklist_items for all to authenticated
  using (public.user_has_permission(tenant_id, 'bookings.update'))
  with check (public.user_has_permission(tenant_id, 'bookings.update'));
create trigger booking_checklist_items_updated_at before update on public.booking_checklist_items
  for each row execute function public.set_updated_at();

-- ============ booking_photos ============
create table public.booking_photos (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  booking_id uuid not null references public.bookings(id) on delete cascade,
  pet_id uuid references public.pets(id) on delete set null,
  document_id uuid references public.documents(id) on delete cascade,
  kind public.booking_photo_kind not null default 'general',
  caption text,
  uploaded_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index booking_photos_booking_idx on public.booking_photos(booking_id, kind);
grant select, insert, update, delete on public.booking_photos to authenticated;
grant all on public.booking_photos to service_role;
alter table public.booking_photos enable row level security;
create policy "booking photos readable by tenant staff"
  on public.booking_photos for select to authenticated
  using (public.user_has_tenant_access(tenant_id));
create policy "booking photos writable by booking updaters"
  on public.booking_photos for all to authenticated
  using (public.user_has_permission(tenant_id, 'bookings.update'))
  with check (public.user_has_permission(tenant_id, 'bookings.update'));
create trigger booking_photos_updated_at before update on public.booking_photos
  for each row execute function public.set_updated_at();

-- ============ booking_signoffs ============
create table public.booking_signoffs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  booking_id uuid not null references public.bookings(id) on delete cascade,
  profile_id uuid references public.profiles(id) on delete set null,
  signed_name text not null,
  signed_at timestamptz not null default now(),
  summary_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (booking_id)
);
grant select, insert, update, delete on public.booking_signoffs to authenticated;
grant all on public.booking_signoffs to service_role;
alter table public.booking_signoffs enable row level security;
create policy "signoffs readable by tenant staff"
  on public.booking_signoffs for select to authenticated
  using (public.user_has_tenant_access(tenant_id));
create policy "signoffs writable by signoff permission"
  on public.booking_signoffs for all to authenticated
  using (public.user_has_permission(tenant_id, 'work.signoff'))
  with check (public.user_has_permission(tenant_id, 'work.signoff'));
create trigger booking_signoffs_updated_at before update on public.booking_signoffs
  for each row execute function public.set_updated_at();

-- ============ care_rounds ============
create table public.care_rounds (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  booking_id uuid not null references public.bookings(id) on delete cascade,
  pet_id uuid references public.pets(id) on delete cascade,
  round_date date not null default (now() at time zone 'utc')::date,
  round_kind public.care_round_kind not null,
  done_at timestamptz not null default now(),
  done_by uuid references public.profiles(id) on delete set null,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (booking_id, pet_id, round_date, round_kind)
);
create index care_rounds_tenant_date_idx on public.care_rounds(tenant_id, round_date);
grant select, insert, update, delete on public.care_rounds to authenticated;
grant all on public.care_rounds to service_role;
alter table public.care_rounds enable row level security;
create policy "care rounds readable by tenant staff"
  on public.care_rounds for select to authenticated
  using (public.user_has_tenant_access(tenant_id));
create policy "care rounds writable by hotel managers"
  on public.care_rounds for all to authenticated
  using (public.user_has_permission(tenant_id, 'hotel.manage') or public.user_has_permission(tenant_id, 'bookings.update'))
  with check (public.user_has_permission(tenant_id, 'hotel.manage') or public.user_has_permission(tenant_id, 'bookings.update'));
create trigger care_rounds_updated_at before update on public.care_rounds
  for each row execute function public.set_updated_at();

-- ============ incidents ============
create table public.incidents (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  booking_id uuid references public.bookings(id) on delete set null,
  pet_id uuid references public.pets(id) on delete set null,
  customer_id uuid references public.customers(id) on delete set null,
  severity public.incident_severity not null default 'note',
  category public.incident_category not null default 'other',
  description text not null,
  state public.incident_state not null default 'open',
  raised_by uuid references public.profiles(id) on delete set null,
  acknowledged_by uuid references public.profiles(id) on delete set null,
  acknowledged_at timestamptz,
  resolved_at timestamptz,
  resolution_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index incidents_tenant_state_idx on public.incidents(tenant_id, state, created_at desc);
grant select, insert, update, delete on public.incidents to authenticated;
grant all on public.incidents to service_role;
alter table public.incidents enable row level security;
create policy "incidents readable by tenant staff"
  on public.incidents for select to authenticated
  using (public.user_has_tenant_access(tenant_id));
create policy "incidents raised by staff"
  on public.incidents for insert to authenticated
  with check (public.user_has_permission(tenant_id, 'incidents.raise'));
create policy "incidents updated by acknowledgers"
  on public.incidents for update to authenticated
  using (public.user_has_permission(tenant_id, 'incidents.acknowledge'))
  with check (public.user_has_permission(tenant_id, 'incidents.acknowledge'));
create policy "incidents deleted by admins"
  on public.incidents for delete to authenticated
  using (public.user_has_permission(tenant_id, 'settings.manage'));
create trigger incidents_updated_at before update on public.incidents
  for each row execute function public.set_updated_at();

-- incident photos link
create table public.incident_photos (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  incident_id uuid not null references public.incidents(id) on delete cascade,
  document_id uuid references public.documents(id) on delete cascade,
  created_at timestamptz not null default now()
);
grant select, insert, update, delete on public.incident_photos to authenticated;
grant all on public.incident_photos to service_role;
alter table public.incident_photos enable row level security;
create policy "incident photos readable by tenant staff"
  on public.incident_photos for select to authenticated
  using (public.user_has_tenant_access(tenant_id));
create policy "incident photos writable by incident raisers"
  on public.incident_photos for all to authenticated
  using (public.user_has_permission(tenant_id, 'incidents.raise'))
  with check (public.user_has_permission(tenant_id, 'incidents.raise'));

-- urgent incidents raise a notification event
alter type public.notification_event_type add value if not exists 'incident_raised';
