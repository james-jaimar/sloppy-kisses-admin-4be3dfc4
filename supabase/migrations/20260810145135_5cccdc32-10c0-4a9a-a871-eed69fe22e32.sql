-- 1. Policy settings extensions -------------------------------------------------
ALTER TABLE public.policy_settings
  ADD COLUMN IF NOT EXISTS late_pickup_cutoff_time time NOT NULL DEFAULT '17:30',
  ADD COLUMN IF NOT EXISTS late_pickup_grace_minutes integer NOT NULL DEFAULT 15,
  ADD COLUMN IF NOT EXISTS late_pickup_fee_zar numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS late_pickup_fee_per_15min numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS overnight_conversion_after_time time NOT NULL DEFAULT '18:30',
  ADD COLUMN IF NOT EXISTS overnight_conversion_rate_zar numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS abandonment_hours integer NOT NULL DEFAULT 48,
  ADD COLUMN IF NOT EXISTS failed_collection_fee_zar numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS transport_radius_km numeric(8,2) NOT NULL DEFAULT 20,
  ADD COLUMN IF NOT EXISTS parasite_treatment_fee_zar numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS annual_increase_percent numeric(6,2) NOT NULL DEFAULT 10;

-- 2. Service group helper + closed-day guard -------------------------------------
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS closure_override boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.service_group(p_service text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $$
  SELECT CASE
    WHEN p_service LIKE 'daycare%' THEN 'daycare'
    WHEN p_service LIKE 'hotel%' THEN 'hotel'
    WHEN p_service LIKE 'grooming%' THEN 'grooming'
    WHEN p_service = 'pickup_dropoff' THEN 'transport'
    ELSE p_service
  END;
$$;

CREATE OR REPLACE FUNCTION public.bookings_block_closed_days()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
  v_day date;
  v_name text;
BEGIN
  IF NEW.closure_override THEN RETURN NEW; END IF;
  IF NEW.status IN ('cancelled','no_show','draft') THEN RETURN NEW; END IF;
  v_day := COALESCE(NEW.start_date, (NEW.start_at AT TIME ZONE 'Africa/Johannesburg')::date);
  IF v_day IS NULL THEN RETURN NEW; END IF;

  IF TG_OP = 'UPDATE'
     AND COALESCE(OLD.start_date, (OLD.start_at AT TIME ZONE 'Africa/Johannesburg')::date) IS NOT DISTINCT FROM v_day
     AND OLD.status = NEW.status THEN
    RETURN NEW;
  END IF;

  SELECT c.name INTO v_name
  FROM public.closures c
  WHERE c.tenant_id = NEW.tenant_id
    AND v_day BETWEEN c.start_date AND c.end_date
    AND (cardinality(c.services) = 0 OR public.service_group(NEW.service_type::text) = ANY (c.services))
  LIMIT 1;

  IF v_name IS NOT NULL THEN
    RAISE EXCEPTION 'Closed on % (%). Tick the closure override to book anyway.',
      to_char(v_day, 'DD Mon YYYY'), v_name;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_bookings_block_closed_days ON public.bookings;
CREATE TRIGGER trg_bookings_block_closed_days
BEFORE INSERT OR UPDATE ON public.bookings
FOR EACH ROW EXECUTE FUNCTION public.bookings_block_closed_days();

-- 3. Daycare catch-up credits ----------------------------------------------------
CREATE TABLE IF NOT EXISTS public.daycare_catchup_credits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  pet_id uuid REFERENCES public.pets(id) ON DELETE CASCADE,
  enrolment_id uuid REFERENCES public.daycare_enrolments(id) ON DELETE SET NULL,
  missed_date date NOT NULL,
  reason text NOT NULL DEFAULT 'closure',
  status text NOT NULL DEFAULT 'available',
  expires_on date NOT NULL,
  used_on date,
  used_booking_id uuid REFERENCES public.bookings(id) ON DELETE SET NULL,
  notes text,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.daycare_catchup_credits TO authenticated;
GRANT ALL ON public.daycare_catchup_credits TO service_role;

ALTER TABLE public.daycare_catchup_credits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS daycare_catchup_credits_select ON public.daycare_catchup_credits;
CREATE POLICY daycare_catchup_credits_select ON public.daycare_catchup_credits
  FOR SELECT TO authenticated
  USING (user_has_tenant_access(tenant_id) OR customer_id = current_customer_id(tenant_id));

DROP POLICY IF EXISTS daycare_catchup_credits_insert ON public.daycare_catchup_credits;
CREATE POLICY daycare_catchup_credits_insert ON public.daycare_catchup_credits
  FOR INSERT TO authenticated
  WITH CHECK (user_has_permission(tenant_id, 'bookings.edit'));

DROP POLICY IF EXISTS daycare_catchup_credits_update ON public.daycare_catchup_credits;
CREATE POLICY daycare_catchup_credits_update ON public.daycare_catchup_credits
  FOR UPDATE TO authenticated
  USING (user_has_permission(tenant_id, 'bookings.edit'))
  WITH CHECK (user_has_permission(tenant_id, 'bookings.edit'));

DROP POLICY IF EXISTS daycare_catchup_credits_delete ON public.daycare_catchup_credits;
CREATE POLICY daycare_catchup_credits_delete ON public.daycare_catchup_credits
  FOR DELETE TO authenticated
  USING (user_has_permission(tenant_id, 'bookings.edit'));

CREATE UNIQUE INDEX IF NOT EXISTS daycare_catchup_credits_unique_day
  ON public.daycare_catchup_credits (tenant_id, COALESCE(pet_id, customer_id), missed_date);
CREATE INDEX IF NOT EXISTS daycare_catchup_credits_lookup
  ON public.daycare_catchup_credits (tenant_id, customer_id, status);

DROP TRIGGER IF EXISTS trg_daycare_catchup_credits_updated ON public.daycare_catchup_credits;
CREATE TRIGGER trg_daycare_catchup_credits_updated
BEFORE UPDATE ON public.daycare_catchup_credits
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.daycare_grant_closure_credits(p_tenant_id uuid, p_start date, p_end date)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_window int;
  v_count int := 0;
BEGIN
  IF NOT user_has_permission(p_tenant_id, 'bookings.edit') THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;

  SELECT COALESCE(daycare_catchup_window_days, 30) INTO v_window
  FROM public.policy_settings WHERE tenant_id = p_tenant_id;
  v_window := COALESCE(v_window, 30);

  WITH days AS (
    SELECT d::date AS day FROM generate_series(p_start, p_end, INTERVAL '1 day') d
  ),
  closed AS (
    SELECT day FROM days WHERE public.is_closed(p_tenant_id, day, 'daycare')
  ),
  due AS (
    SELECT e.customer_id, e.pet_id, e.id AS enrolment_id, c.day
    FROM public.daycare_enrolments e
    CROSS JOIN closed c
    WHERE e.tenant_id = p_tenant_id
      AND COALESCE(e.active, true)
      AND e.start_date <= c.day
      AND (e.end_date IS NULL OR e.end_date >= c.day)
      AND NOT (e.paused_from IS NOT NULL AND c.day BETWEEN e.paused_from AND COALESCE(e.paused_to, DATE '9999-12-31'))
      AND lower(to_char(c.day, 'Dy')) = ANY (COALESCE(e.selected_days, ARRAY['mon','tue','wed','thu','fri']::text[]))
  ),
  ins AS (
    INSERT INTO public.daycare_catchup_credits
      (tenant_id, customer_id, pet_id, enrolment_id, missed_date, reason, expires_on, created_by)
    SELECT p_tenant_id, d.customer_id, d.pet_id, d.enrolment_id, d.day, 'closure',
           d.day + v_window, current_profile_id()
    FROM due d
    ON CONFLICT DO NOTHING
    RETURNING 1
  )
  SELECT count(*)::int INTO v_count FROM ins;

  RETURN v_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.daycare_expire_catchup_credits(p_tenant_id uuid DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_count int;
BEGIN
  UPDATE public.daycare_catchup_credits
     SET status = 'expired', updated_at = now()
   WHERE status = 'available'
     AND expires_on < CURRENT_DATE
     AND (p_tenant_id IS NULL OR tenant_id = p_tenant_id);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.daycare_redeem_catchup_credit(p_credit_id uuid, p_used_on date, p_booking_id uuid DEFAULT NULL)
RETURNS public.daycare_catchup_credits
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE r public.daycare_catchup_credits;
BEGIN
  SELECT * INTO r FROM public.daycare_catchup_credits WHERE id = p_credit_id;
  IF r.id IS NULL THEN RAISE EXCEPTION 'Credit not found'; END IF;
  IF NOT user_has_permission(r.tenant_id, 'bookings.edit') THEN RAISE EXCEPTION 'Not allowed'; END IF;
  IF r.status <> 'available' THEN RAISE EXCEPTION 'Credit is % — only available credits can be used', r.status; END IF;
  IF p_used_on > r.expires_on THEN RAISE EXCEPTION 'Credit expired on %', to_char(r.expires_on, 'DD Mon YYYY'); END IF;

  UPDATE public.daycare_catchup_credits
     SET status = 'used', used_on = p_used_on, used_booking_id = p_booking_id, updated_at = now()
   WHERE id = p_credit_id
  RETURNING * INTO r;
  RETURN r;
END;
$$;

REVOKE ALL ON FUNCTION public.daycare_grant_closure_credits(uuid, date, date) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.daycare_expire_catchup_credits(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.daycare_redeem_catchup_credit(uuid, date, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.daycare_grant_closure_credits(uuid, date, date) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.daycare_expire_catchup_credits(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.daycare_redeem_catchup_credit(uuid, date, uuid) TO authenticated, service_role;

-- 4. Hotel amendment fee ---------------------------------------------------------
CREATE OR REPLACE FUNCTION public.hotel_amendment_fee_on_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_free int;
  v_fee numeric(12,2);
  v_count int;
  v_inv uuid;
  v_status text;
  v_paid numeric;
BEGIN
  IF public.service_group(NEW.service_type::text) <> 'hotel' THEN RETURN NEW; END IF;
  IF NEW.status IN ('draft','cancelled','no_show') THEN RETURN NEW; END IF;
  IF OLD.start_date IS NOT DISTINCT FROM NEW.start_date
     AND OLD.end_date IS NOT DISTINCT FROM NEW.end_date THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(hotel_free_amendments, 1), COALESCE(hotel_amendment_fee, 0)
    INTO v_free, v_fee
  FROM public.policy_settings WHERE tenant_id = NEW.tenant_id;
  v_free := COALESCE(v_free, 1);
  v_fee := COALESCE(v_fee, 0);

  v_count := COALESCE(OLD.amendment_count, 0) + 1;
  UPDATE public.bookings SET amendment_count = v_count WHERE id = NEW.id;

  IF v_fee <= 0 OR v_count <= v_free THEN RETURN NEW; END IF;

  SELECT i.id, i.status::text, i.amount_paid INTO v_inv, v_status, v_paid
  FROM public.invoices i
  WHERE i.id = NEW.invoice_id;

  IF v_inv IS NULL THEN
    SELECT DISTINCT i.id, i.status::text, i.amount_paid INTO v_inv, v_status, v_paid
    FROM public.invoice_items ii
    JOIN public.invoices i ON i.id = ii.invoice_id
    WHERE ii.booking_id = NEW.id
    LIMIT 1;
  END IF;

  IF v_inv IS NULL OR v_status IN ('paid','cancelled') THEN RETURN NEW; END IF;

  INSERT INTO public.invoice_items(
    tenant_id, invoice_id, booking_id, description, quantity, unit_price, line_total,
    sort_order, source_type, source_id
  ) VALUES (
    NEW.tenant_id, v_inv, NEW.id,
    'Amendment fee — booking ' || COALESCE(NEW.booking_number,'') || ' (change ' || v_count || ')',
    1, v_fee, v_fee, 90, 'amendment_fee', NEW.id
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_hotel_amendment_fee ON public.bookings;
CREATE TRIGGER trg_hotel_amendment_fee
AFTER UPDATE ON public.bookings
FOR EACH ROW EXECUTE FUNCTION public.hotel_amendment_fee_on_change();

-- 5. Late collection -------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.apply_late_collection(
  p_booking_id uuid,
  p_collected_at timestamptz DEFAULT now(),
  p_convert_overnight boolean DEFAULT false,
  p_waive boolean DEFAULT false,
  p_note text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  b public.bookings;
  ps public.policy_settings;
  v_local time;
  v_minutes int;
  v_amount numeric(12,2) := 0;
  v_desc text;
  v_inv uuid;
  v_status text;
BEGIN
  SELECT * INTO b FROM public.bookings WHERE id = p_booking_id;
  IF b.id IS NULL THEN RAISE EXCEPTION 'Booking not found'; END IF;
  IF NOT user_has_permission(b.tenant_id, 'bookings.edit') THEN RAISE EXCEPTION 'Not allowed'; END IF;

  SELECT * INTO ps FROM public.policy_settings WHERE tenant_id = b.tenant_id;

  v_local := (p_collected_at AT TIME ZONE 'Africa/Johannesburg')::time;
  v_minutes := GREATEST(
    0,
    (EXTRACT(EPOCH FROM (v_local - COALESCE(ps.late_pickup_cutoff_time, TIME '17:30'))) / 60)::int
      - COALESCE(ps.late_pickup_grace_minutes, 0)
  );

  IF p_waive THEN
    v_amount := 0;
    v_desc := NULL;
  ELSIF p_convert_overnight THEN
    v_amount := COALESCE(ps.overnight_conversion_rate_zar, 0);
    v_desc := 'Overnight boarding after late collection — booking ' || COALESCE(b.booking_number,'');
  ELSIF v_minutes > 0 THEN
    v_amount := COALESCE(ps.late_pickup_fee_zar, 0)
      + COALESCE(ps.late_pickup_fee_per_15min, 0) * CEIL(v_minutes::numeric / 15);
    v_desc := 'Late collection fee — ' || v_minutes || ' min after '
      || to_char(COALESCE(ps.late_pickup_cutoff_time, TIME '17:30'), 'HH24:MI')
      || ' (booking ' || COALESCE(b.booking_number,'') || ')';
  END IF;

  IF v_amount > 0 THEN
    v_inv := b.invoice_id;
    IF v_inv IS NULL THEN
      SELECT DISTINCT i.id INTO v_inv
      FROM public.invoice_items ii JOIN public.invoices i ON i.id = ii.invoice_id
      WHERE ii.booking_id = b.id LIMIT 1;
    END IF;
    IF v_inv IS NULL THEN
      v_inv := public.ensure_booking_invoice(b.id);
    END IF;

    SELECT status::text INTO v_status FROM public.invoices WHERE id = v_inv;
    IF v_status IN ('paid','cancelled') THEN
      RETURN jsonb_build_object('minutes_late', v_minutes, 'amount', v_amount, 'charged', false,
        'note', 'Invoice is ' || v_status || ' — raise this separately.');
    END IF;

    INSERT INTO public.invoice_items(
      tenant_id, invoice_id, booking_id, description, quantity, unit_price, line_total,
      sort_order, source_type, source_id
    ) VALUES (
      b.tenant_id, v_inv, b.id, v_desc, 1, v_amount, v_amount, 95,
      CASE WHEN p_convert_overnight THEN 'overnight_conversion' ELSE 'late_collection' END, b.id
    );
  END IF;

  UPDATE public.bookings
     SET notes_internal = COALESCE(notes_internal || E'\n', '')
       || to_char(p_collected_at AT TIME ZONE 'Africa/Johannesburg', 'DD Mon YYYY HH24:MI')
       || ' — collected ' || v_minutes || ' min late'
       || CASE WHEN p_waive THEN ' (fee waived)'
               WHEN v_amount > 0 THEN ' (R' || to_char(v_amount, 'FM999999990.00') || ' charged)'
               ELSE '' END
       || COALESCE(' — ' || p_note, ''),
         updated_at = now()
   WHERE id = b.id;

  RETURN jsonb_build_object('minutes_late', v_minutes, 'amount', v_amount, 'charged', v_amount > 0,
    'converted_overnight', p_convert_overnight);
END;
$$;

REVOKE ALL ON FUNCTION public.apply_late_collection(uuid, timestamptz, boolean, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.apply_late_collection(uuid, timestamptz, boolean, boolean, text) TO authenticated, service_role;

-- 6. Annual price increase -------------------------------------------------------
CREATE OR REPLACE FUNCTION public.apply_price_increase(
  p_tenant_id uuid,
  p_percent numeric,
  p_targets text[] DEFAULT ARRAY['daycare','hotel','grooming'],
  p_round_to numeric DEFAULT 1,
  p_dry_run boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_rows jsonb := '[]'::jsonb;
  v_factor numeric := 1 + (p_percent / 100.0);
  v_round numeric := GREATEST(COALESCE(p_round_to, 1), 0.01);
BEGIN
  IF NOT user_has_permission(p_tenant_id, 'settings.policies.manage') THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;

  WITH candidates AS (
    SELECT 'daycare_plans' AS table_name, id, name AS label, price AS old_price FROM public.daycare_plans
      WHERE tenant_id = p_tenant_id AND COALESCE(active,true) AND 'daycare' = ANY(p_targets)
    UNION ALL
    SELECT 'hotel_rate_cards', id, display_name, nightly_rate_zar FROM public.hotel_rate_cards
      WHERE tenant_id = p_tenant_id AND COALESCE(active,true) AND 'hotel' = ANY(p_targets)
    UNION ALL
    SELECT 'hotel_surcharges', id, name, price_zar FROM public.hotel_surcharges
      WHERE tenant_id = p_tenant_id AND COALESCE(active,true) AND 'hotel' = ANY(p_targets)
    UNION ALL
    SELECT 'grooming_packages', id, name, price_zar FROM public.grooming_packages
      WHERE tenant_id = p_tenant_id AND COALESCE(active,true) AND 'grooming' = ANY(p_targets)
    UNION ALL
    SELECT 'grooming_addons', id, name, price_zar FROM public.grooming_addons
      WHERE tenant_id = p_tenant_id AND COALESCE(active,true) AND 'grooming' = ANY(p_targets)
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'table', table_name, 'id', id, 'label', label,
    'old_price', old_price,
    'new_price', round((old_price * v_factor) / v_round) * v_round
  ) ORDER BY table_name, label), '[]'::jsonb)
  INTO v_rows
  FROM candidates
  WHERE COALESCE(old_price, 0) > 0;

  IF NOT p_dry_run THEN
    UPDATE public.daycare_plans t SET price = (r->>'new_price')::numeric, updated_at = now()
      FROM jsonb_array_elements(v_rows) r
     WHERE r->>'table' = 'daycare_plans' AND t.id = (r->>'id')::uuid;

    UPDATE public.hotel_rate_cards t SET nightly_rate_zar = (r->>'new_price')::numeric, updated_at = now()
      FROM jsonb_array_elements(v_rows) r
     WHERE r->>'table' = 'hotel_rate_cards' AND t.id = (r->>'id')::uuid;

    UPDATE public.hotel_surcharges t SET price_zar = (r->>'new_price')::numeric, updated_at = now()
      FROM jsonb_array_elements(v_rows) r
     WHERE r->>'table' = 'hotel_surcharges' AND t.id = (r->>'id')::uuid;

    UPDATE public.grooming_packages t SET price_zar = (r->>'new_price')::numeric, updated_at = now()
      FROM jsonb_array_elements(v_rows) r
     WHERE r->>'table' = 'grooming_packages' AND t.id = (r->>'id')::uuid;

    UPDATE public.grooming_addons t SET price_zar = (r->>'new_price')::numeric, updated_at = now()
      FROM jsonb_array_elements(v_rows) r
     WHERE r->>'table' = 'grooming_addons' AND t.id = (r->>'id')::uuid;
  END IF;

  RETURN jsonb_build_object('percent', p_percent, 'dry_run', p_dry_run,
    'count', jsonb_array_length(v_rows), 'rows', v_rows);
END;
$$;

REVOKE ALL ON FUNCTION public.apply_price_increase(uuid, numeric, text[], numeric, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.apply_price_increase(uuid, numeric, text[], numeric, boolean) TO authenticated, service_role;