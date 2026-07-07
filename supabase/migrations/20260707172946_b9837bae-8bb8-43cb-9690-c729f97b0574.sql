
-- 1) Extend booking_status enum
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_enum e ON t.oid = e.enumtypid WHERE t.typname='booking_status' AND e.enumlabel='checked_in') THEN
    ALTER TYPE public.booking_status ADD VALUE 'checked_in';
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_enum e ON t.oid = e.enumtypid WHERE t.typname='booking_status' AND e.enumlabel='grooming') THEN
    ALTER TYPE public.booking_status ADD VALUE 'grooming';
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_enum e ON t.oid = e.enumtypid WHERE t.typname='booking_status' AND e.enumlabel='ready') THEN
    ALTER TYPE public.booking_status ADD VALUE 'ready';
  END IF;
END $$;

-- 2) Register permission (label is NOT NULL)
INSERT INTO public.permissions (code, label, description)
VALUES ('settings.grooming.manage', 'Manage grooming rate card', 'Create, edit and delete grooming packages and add-ons')
ON CONFLICT (code) DO NOTHING;

-- 3) grooming_packages
CREATE TABLE IF NOT EXISTS public.grooming_packages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  code text NOT NULL,
  name text NOT NULL,
  species text NOT NULL CHECK (species IN ('dog','cat','rabbit')),
  size_band text CHECK (size_band IN ('small','medium','large','xl','xxl')),
  package_type text NOT NULL CHECK (package_type IN ('full','express','standard')),
  price_zar numeric(10,2) NOT NULL CHECK (price_zar >= 0),
  expected_minutes int NOT NULL DEFAULT 60,
  active boolean NOT NULL DEFAULT true,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, code)
);
CREATE INDEX IF NOT EXISTS grooming_packages_tenant_idx ON public.grooming_packages(tenant_id, active);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.grooming_packages TO authenticated;
GRANT ALL ON public.grooming_packages TO service_role;
ALTER TABLE public.grooming_packages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "grooming_packages_select" ON public.grooming_packages
  FOR SELECT TO authenticated
  USING (public.user_has_tenant_access(tenant_id));

CREATE POLICY "grooming_packages_insert" ON public.grooming_packages
  FOR INSERT TO authenticated
  WITH CHECK (public.user_has_permission(tenant_id, 'settings.grooming.manage'));

CREATE POLICY "grooming_packages_update" ON public.grooming_packages
  FOR UPDATE TO authenticated
  USING (public.user_has_permission(tenant_id, 'settings.grooming.manage'))
  WITH CHECK (public.user_has_permission(tenant_id, 'settings.grooming.manage'));

CREATE POLICY "grooming_packages_delete" ON public.grooming_packages
  FOR DELETE TO authenticated
  USING (public.user_has_permission(tenant_id, 'settings.grooming.manage'));

-- 4) grooming_addons
CREATE TABLE IF NOT EXISTS public.grooming_addons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  code text NOT NULL,
  name text NOT NULL,
  price_zar numeric(10,2) NOT NULL CHECK (price_zar >= 0),
  kind text NOT NULL CHECK (kind IN ('fixed','shampoo_upgrade','anal','teeth','nails','ears','travel')),
  active boolean NOT NULL DEFAULT true,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, code)
);
CREATE INDEX IF NOT EXISTS grooming_addons_tenant_idx ON public.grooming_addons(tenant_id, active);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.grooming_addons TO authenticated;
GRANT ALL ON public.grooming_addons TO service_role;
ALTER TABLE public.grooming_addons ENABLE ROW LEVEL SECURITY;

CREATE POLICY "grooming_addons_select" ON public.grooming_addons
  FOR SELECT TO authenticated
  USING (public.user_has_tenant_access(tenant_id));

CREATE POLICY "grooming_addons_insert" ON public.grooming_addons
  FOR INSERT TO authenticated
  WITH CHECK (public.user_has_permission(tenant_id, 'settings.grooming.manage'));

CREATE POLICY "grooming_addons_update" ON public.grooming_addons
  FOR UPDATE TO authenticated
  USING (public.user_has_permission(tenant_id, 'settings.grooming.manage'))
  WITH CHECK (public.user_has_permission(tenant_id, 'settings.grooming.manage'));

CREATE POLICY "grooming_addons_delete" ON public.grooming_addons
  FOR DELETE TO authenticated
  USING (public.user_has_permission(tenant_id, 'settings.grooming.manage'));

-- 5) grooming_booking_addons — snapshotted per-booking add-ons
CREATE TABLE IF NOT EXISTS public.grooming_booking_addons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  booking_id uuid NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  addon_id uuid REFERENCES public.grooming_addons(id) ON DELETE SET NULL,
  addon_code text NOT NULL,
  addon_name text NOT NULL,
  price_zar_snapshot numeric(10,2) NOT NULL,
  qty int NOT NULL DEFAULT 1 CHECK (qty > 0),
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS grooming_booking_addons_booking_idx ON public.grooming_booking_addons(booking_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.grooming_booking_addons TO authenticated;
GRANT ALL ON public.grooming_booking_addons TO service_role;
ALTER TABLE public.grooming_booking_addons ENABLE ROW LEVEL SECURITY;

CREATE POLICY "grooming_booking_addons_rw" ON public.grooming_booking_addons
  FOR ALL TO authenticated
  USING (public.user_has_tenant_access(tenant_id))
  WITH CHECK (public.user_has_tenant_access(tenant_id));

-- 6) booking_status_events
CREATE TABLE IF NOT EXISTS public.booking_status_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  booking_id uuid NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  from_status public.booking_status,
  to_status public.booking_status NOT NULL,
  actor_user_id uuid,
  event_kind text NOT NULL DEFAULT 'status_change' CHECK (event_kind IN ('status_change','vaccination_override','note')),
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS booking_status_events_booking_idx ON public.booking_status_events(booking_id, created_at DESC);
GRANT SELECT, INSERT ON public.booking_status_events TO authenticated;
GRANT ALL ON public.booking_status_events TO service_role;
ALTER TABLE public.booking_status_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "booking_status_events_select" ON public.booking_status_events
  FOR SELECT TO authenticated
  USING (public.user_has_tenant_access(tenant_id));

CREATE POLICY "booking_status_events_insert" ON public.booking_status_events
  FOR INSERT TO authenticated
  WITH CHECK (public.user_has_tenant_access(tenant_id));

-- 7) Extend grooming_booking_details
ALTER TABLE public.grooming_booking_details
  ADD COLUMN IF NOT EXISTS package_id uuid REFERENCES public.grooming_packages(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS actual_start_at timestamptz,
  ADD COLUMN IF NOT EXISTS actual_end_at timestamptz,
  ADD COLUMN IF NOT EXISTS overtime_minutes int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS matted_surcharge_zar numeric(10,2),
  ADD COLUMN IF NOT EXISTS sedation_surcharge_zar numeric(10,2),
  ADD COLUMN IF NOT EXISTS pensioner_discount_applied boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS loyalty_free_groom boolean NOT NULL DEFAULT false;

-- 8) updated_at triggers (function public.set_updated_at already exists)
DROP TRIGGER IF EXISTS trg_grooming_packages_updated ON public.grooming_packages;
CREATE TRIGGER trg_grooming_packages_updated
  BEFORE UPDATE ON public.grooming_packages
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_grooming_addons_updated ON public.grooming_addons;
CREATE TRIGGER trg_grooming_addons_updated
  BEFORE UPDATE ON public.grooming_addons
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 9) Auto-log booking status changes
CREATE OR REPLACE FUNCTION public.log_booking_status_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO public.booking_status_events (tenant_id, booking_id, from_status, to_status, actor_user_id, event_kind)
    VALUES (NEW.tenant_id, NEW.id, OLD.status, NEW.status, auth.uid(), 'status_change');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_booking_status_change ON public.bookings;
CREATE TRIGGER trg_booking_status_change
  AFTER UPDATE ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.log_booking_status_change();

-- 10) Seed rate card for every tenant
INSERT INTO public.grooming_packages (tenant_id, code, name, species, size_band, package_type, price_zar, expected_minutes, sort_order)
SELECT t.id, v.code, v.name, v.species, v.size_band, v.package_type, v.price_zar, v.expected_minutes, v.sort_order
FROM public.tenants t
CROSS JOIN (VALUES
  ('dog_small_full',     'Small dog — Full groom',      'dog', 'small',  'full',    445, 60,  10),
  ('dog_small_express',  'Small dog — Express',         'dog', 'small',  'express', 320, 45,  11),
  ('dog_medium_full',    'Medium dog — Full groom',     'dog', 'medium', 'full',    500, 60,  20),
  ('dog_medium_express', 'Medium dog — Express',        'dog', 'medium', 'express', 370, 45,  21),
  ('dog_large_full',     'Large dog — Full groom',      'dog', 'large',  'full',    545, 75,  30),
  ('dog_large_express',  'Large dog — Express',         'dog', 'large',  'express', 385, 50,  31),
  ('dog_xl_full',        'X-Large dog — Full groom',    'dog', 'xl',     'full',    620, 90,  40),
  ('dog_xl_express',     'X-Large dog — Express',       'dog', 'xl',     'express', 450, 60,  41),
  ('dog_xxl_full',       'XX-Large dog — Full groom',   'dog', 'xxl',    'full',    700, 105, 50),
  ('dog_xxl_express',    'XX-Large dog — Express',      'dog', 'xxl',    'express', 490, 75,  51),
  ('cat_standard',       'Cat — Bath, brush, style & shave',    'cat',    NULL, 'standard', 570, 60, 60),
  ('rabbit_standard',    'Rabbit — Bath, brush, style & shave', 'rabbit', NULL, 'standard', 570, 60, 70)
) AS v(code, name, species, size_band, package_type, price_zar, expected_minutes, sort_order)
ON CONFLICT (tenant_id, code) DO NOTHING;

INSERT INTO public.grooming_addons (tenant_id, code, name, price_zar, kind, sort_order)
SELECT t.id, v.code, v.name, v.price_zar, v.kind, v.sort_order
FROM public.tenants t
CROSS JOIN (VALUES
  ('teeth_gel',         'Teeth cleaning (gel only)',                  130, 'teeth',           10),
  ('teeth_toothpaste',  'Teeth cleaning + toothpaste (own brush)',    185, 'teeth',           11),
  ('nail_trim',         'Nail trimming',                              130, 'nails',           20),
  ('ear_clean',         'Ear cleaning',                               130, 'ears',            30),
  ('shampoo_hypo',      'Hypoallergenic shampoo & conditioner',        80, 'shampoo_upgrade', 40),
  ('shampoo_tick_flea', 'Tick & flea shampoo & conditioner',           60, 'shampoo_upgrade', 41),
  ('anal_gland',        'Anal gland express',                         185, 'anal',            50),
  ('mobile_travel',     'Mobile travel fee (per household)',          110, 'travel',          99)
) AS v(code, name, price_zar, kind, sort_order)
ON CONFLICT (tenant_id, code) DO NOTHING;
