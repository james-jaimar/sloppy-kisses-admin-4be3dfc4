-- 1. customer_addresses
CREATE TABLE public.customer_addresses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  label text NOT NULL DEFAULT 'Home',
  address_type text,
  address_line_1 text,
  address_line_2 text,
  suburb text,
  city text,
  province text,
  postcode text,
  country_code text NOT NULL DEFAULT 'ZA',
  formatted_address text,
  google_place_id text,
  latitude double precision,
  longitude double precision,
  is_primary boolean NOT NULL DEFAULT false,
  is_mobile_grooming_address boolean NOT NULL DEFAULT false,
  access_notes text,
  parking_notes text,
  gate_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.customer_addresses TO authenticated;
GRANT ALL ON public.customer_addresses TO service_role;

ALTER TABLE public.customer_addresses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff manage tenant customer addresses"
  ON public.customer_addresses FOR ALL TO authenticated
  USING (public.user_has_tenant_access(tenant_id))
  WITH CHECK (public.user_has_tenant_access(tenant_id));

CREATE POLICY "Customers manage own addresses"
  ON public.customer_addresses FOR ALL TO authenticated
  USING (customer_id = public.current_customer_id(tenant_id))
  WITH CHECK (customer_id = public.current_customer_id(tenant_id));

CREATE INDEX idx_customer_addresses_tenant ON public.customer_addresses(tenant_id);
CREATE INDEX idx_customer_addresses_customer ON public.customer_addresses(customer_id);
CREATE INDEX idx_customer_addresses_place ON public.customer_addresses(google_place_id) WHERE google_place_id IS NOT NULL;
CREATE INDEX idx_customer_addresses_customer_primary ON public.customer_addresses(customer_id, is_primary);

CREATE TRIGGER trg_customer_addresses_updated_at
  BEFORE UPDATE ON public.customer_addresses
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 2. Backfill (idempotent)
INSERT INTO public.customer_addresses (
  tenant_id, customer_id, label, address_type, address_line_1, address_line_2,
  suburb, city, province, postcode, country_code, formatted_address,
  is_primary, is_mobile_grooming_address
)
SELECT
  c.tenant_id, c.id, 'Home', 'home',
  NULLIF(btrim(coalesce(c.address_line_1, '')), ''),
  NULLIF(btrim(coalesce(c.address_line_2, '')), ''),
  NULLIF(btrim(coalesce(c.suburb, '')), ''),
  NULLIF(btrim(coalesce(c.city, '')), ''),
  NULLIF(btrim(coalesce(c.province, '')), ''),
  NULLIF(btrim(coalesce(c.postcode, '')), ''),
  'ZA',
  NULLIF(array_to_string(ARRAY[
    NULLIF(btrim(coalesce(c.address_line_1, '')), ''),
    NULLIF(btrim(coalesce(c.address_line_2, '')), ''),
    NULLIF(btrim(coalesce(c.suburb, '')), ''),
    NULLIF(btrim(coalesce(c.city, '')), ''),
    NULLIF(btrim(coalesce(c.province, '')), ''),
    NULLIF(btrim(coalesce(c.postcode, '')), '')
  ], ', '), ''),
  true, true
FROM public.customers c
WHERE (
    NULLIF(btrim(coalesce(c.address_line_1, '')), '') IS NOT NULL
 OR NULLIF(btrim(coalesce(c.address_line_2, '')), '') IS NOT NULL
 OR NULLIF(btrim(coalesce(c.suburb, '')), '') IS NOT NULL
 OR NULLIF(btrim(coalesce(c.city, '')), '') IS NOT NULL
 OR NULLIF(btrim(coalesce(c.province, '')), '') IS NOT NULL
 OR NULLIF(btrim(coalesce(c.postcode, '')), '') IS NOT NULL
  )
  AND NOT EXISTS (
    SELECT 1 FROM public.customer_addresses ca
    WHERE ca.customer_id = c.id AND ca.address_type = 'home' AND ca.is_primary
  );

-- 3. bookings snapshot columns
ALTER TABLE public.bookings
  ADD COLUMN service_address_id uuid REFERENCES public.customer_addresses(id) ON DELETE SET NULL,
  ADD COLUMN service_address_text text,
  ADD COLUMN service_place_id text,
  ADD COLUMN service_suburb text,
  ADD COLUMN service_city text,
  ADD COLUMN service_postcode text;

CREATE INDEX idx_bookings_service_address ON public.bookings(service_address_id) WHERE service_address_id IS NOT NULL;

-- 4. transport_details
ALTER TABLE public.transport_details
  ADD COLUMN pickup_address_id uuid REFERENCES public.customer_addresses(id) ON DELETE SET NULL,
  ADD COLUMN pickup_place_id text,
  ADD COLUMN dropoff_address_id uuid REFERENCES public.customer_addresses(id) ON DELETE SET NULL,
  ADD COLUMN dropoff_place_id text;

-- 5. resources (mobile van fields)
ALTER TABLE public.resources
  ADD COLUMN start_place_id text,
  ADD COLUMN end_place_id text,
  ADD COLUMN start_address_text text,
  ADD COLUMN end_address_text text,
  ADD COLUMN workday_start time,
  ADD COLUMN workday_end time,
  ADD COLUMN colour text,
  ADD COLUMN registration text;

-- 6. route optimisation tables
CREATE TABLE public.grooming_route_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  route_date date NOT NULL,
  status text NOT NULL DEFAULT 'draft',
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  total_distance_meters bigint,
  total_travel_seconds bigint,
  google_request_metadata jsonb,
  google_response_summary jsonb,
  applied_at timestamptz,
  applied_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.grooming_route_runs TO authenticated;
GRANT ALL ON public.grooming_route_runs TO service_role;
ALTER TABLE public.grooming_route_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff manage tenant route runs"
  ON public.grooming_route_runs FOR ALL TO authenticated
  USING (public.user_has_tenant_access(tenant_id))
  WITH CHECK (public.user_has_tenant_access(tenant_id));
CREATE INDEX idx_grooming_route_runs_tenant_date ON public.grooming_route_runs(tenant_id, route_date);
CREATE TRIGGER trg_grooming_route_runs_updated_at
  BEFORE UPDATE ON public.grooming_route_runs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.grooming_route_stops (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  route_run_id uuid NOT NULL REFERENCES public.grooming_route_runs(id) ON DELETE CASCADE,
  resource_id uuid NOT NULL REFERENCES public.resources(id) ON DELETE CASCADE,
  booking_id uuid NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  stop_sequence integer NOT NULL,
  planned_arrival timestamptz,
  planned_departure timestamptz,
  travel_seconds integer,
  travel_distance_meters integer,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.grooming_route_stops TO authenticated;
GRANT ALL ON public.grooming_route_stops TO service_role;
ALTER TABLE public.grooming_route_stops ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff manage tenant route stops"
  ON public.grooming_route_stops FOR ALL TO authenticated
  USING (public.user_has_tenant_access(tenant_id))
  WITH CHECK (public.user_has_tenant_access(tenant_id));
CREATE INDEX idx_grooming_route_stops_run_seq ON public.grooming_route_stops(route_run_id, stop_sequence);
CREATE INDEX idx_grooming_route_stops_tenant ON public.grooming_route_stops(tenant_id);
CREATE INDEX idx_grooming_route_stops_booking ON public.grooming_route_stops(booking_id);