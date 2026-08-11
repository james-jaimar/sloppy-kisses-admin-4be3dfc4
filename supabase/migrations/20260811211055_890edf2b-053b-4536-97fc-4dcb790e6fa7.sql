-- 1. Estimates: extras + hold
ALTER TABLE public.estimates
  ADD COLUMN IF NOT EXISTS extras jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS hold_until date;

-- 2. Public holidays
CREATE TABLE IF NOT EXISTS public.public_holidays (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  holiday_date date NOT NULL,
  name text NOT NULL,
  blocks_dropoff boolean NOT NULL DEFAULT true,
  blocks_collection boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, holiday_date)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.public_holidays TO authenticated;
GRANT ALL ON public.public_holidays TO service_role;

ALTER TABLE public.public_holidays ENABLE ROW LEVEL SECURITY;

CREATE POLICY public_holidays_select ON public.public_holidays
  FOR SELECT TO authenticated USING (public.user_has_tenant_access(tenant_id));
CREATE POLICY public_holidays_customer_select ON public.public_holidays
  FOR SELECT TO authenticated USING (
    tenant_id IN (SELECT c.tenant_id FROM public.customers c WHERE c.linked_profile_id = public.current_profile_id())
  );
CREATE POLICY public_holidays_insert ON public.public_holidays
  FOR INSERT TO authenticated WITH CHECK (public.user_has_permission(tenant_id, 'settings.hotel.manage'));
CREATE POLICY public_holidays_update ON public.public_holidays
  FOR UPDATE TO authenticated USING (public.user_has_permission(tenant_id, 'settings.hotel.manage'));
CREATE POLICY public_holidays_delete ON public.public_holidays
  FOR DELETE TO authenticated USING (public.user_has_permission(tenant_id, 'settings.hotel.manage'));

CREATE TRIGGER trg_public_holidays_updated_at
  BEFORE UPDATE ON public.public_holidays
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 3. Movement (drop-off / collection) rules
CREATE OR REPLACE FUNCTION public.hotel_movement_block(
  p_tenant_id uuid, p_date date, p_kind text
) RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT CASE
    -- hard-closed festive dates: no movement at all
    WHEN to_char(p_date, 'MM-DD') IN ('12-25','12-26','01-01')
      THEN 'No collections or drop-offs on 25/26 December or 1 January.'
    WHEN p_kind = 'dropoff' AND extract(dow FROM p_date) = 0
      THEN 'No check-in on Sundays — arrivals are Monday to Saturday, 09:00–11:00.'
    WHEN EXISTS (
      SELECT 1 FROM public.public_holidays h
       WHERE h.tenant_id = p_tenant_id
         AND h.holiday_date = p_date
         AND ((p_kind = 'dropoff' AND h.blocks_dropoff) OR (p_kind = 'collection' AND h.blocks_collection))
    ) THEN 'Closed on this public holiday ('
         || (SELECT h.name FROM public.public_holidays h WHERE h.tenant_id = p_tenant_id AND h.holiday_date = p_date)
         || ').'
    ELSE NULL
  END;
$$;

GRANT EXECUTE ON FUNCTION public.hotel_movement_block(uuid, date, text) TO authenticated, service_role;

-- 4. Pencilled (quoted, unaccepted) demand per night
CREATE OR REPLACE FUNCTION public.hotel_pencilled_by_day(
  p_tenant_id uuid, p_start date, p_end date, p_exclude_estimate_id uuid DEFAULT NULL
) RETURNS TABLE(day date, accommodation_type text, pets integer)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  WITH days AS (
    SELECT generate_series(p_start, GREATEST(p_start, p_end - 1), interval '1 day')::date AS d
  ),
  held AS (
    SELECT e.accommodation_type,
           (e.start_at AT TIME ZONE 'Africa/Johannesburg')::date AS s,
           COALESCE((e.end_at AT TIME ZONE 'Africa/Johannesburg')::date,
                    (e.start_at AT TIME ZONE 'Africa/Johannesburg')::date + 1) AS e_date,
           GREATEST(1, COALESCE(array_length(e.pet_ids, 1), 1))::int AS pet_count
      FROM public.estimates e
     WHERE e.tenant_id = p_tenant_id
       AND e.status = 'sent'
       AND e.booking_id IS NULL
       AND e.accommodation_type IS NOT NULL
       AND e.start_at IS NOT NULL
       AND COALESCE(e.hold_until, e.expiry_date, CURRENT_DATE) >= CURRENT_DATE
       AND (p_exclude_estimate_id IS NULL OR e.id <> p_exclude_estimate_id)
  )
  SELECT days.d, h.accommodation_type, sum(h.pet_count)::int
    FROM days JOIN held h ON days.d >= h.s AND days.d < h.e_date
   WHERE public.user_has_tenant_access(p_tenant_id)
   GROUP BY days.d, h.accommodation_type
   ORDER BY days.d;
$$;

GRANT EXECUTE ON FUNCTION public.hotel_pencilled_by_day(uuid, date, date, uuid) TO authenticated, service_role;

-- 5. Expire stale quote holds
CREATE OR REPLACE FUNCTION public.expire_quote_holds()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_count integer;
BEGIN
  UPDATE public.estimates
     SET status = 'expired', updated_at = now()
   WHERE status = 'sent'
     AND booking_id IS NULL
     AND COALESCE(hold_until, expiry_date) IS NOT NULL
     AND COALESCE(hold_until, expiry_date) < CURRENT_DATE;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END; $$;

REVOKE ALL ON FUNCTION public.expire_quote_holds() FROM public;
GRANT EXECUTE ON FUNCTION public.expire_quote_holds() TO service_role;

-- 6. Accepting a quote carries the extras through to the booking
CREATE OR REPLACE FUNCTION public.accept_estimate(p_estimate_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_e public.estimates;
  v_booking uuid;
  v_num text;
  v_pet uuid;
  v_s jsonb;
BEGIN
  SELECT * INTO v_e FROM public.estimates WHERE id = p_estimate_id;
  IF v_e.id IS NULL THEN RAISE EXCEPTION 'Quote not found'; END IF;
  IF NOT public.user_has_tenant_access(v_e.tenant_id) THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;
  IF v_e.booking_id IS NOT NULL THEN RETURN v_e.booking_id; END IF;
  IF v_e.start_at IS NULL THEN RAISE EXCEPTION 'Quote has no stay dates'; END IF;

  v_num := public.next_booking_number(v_e.tenant_id);

  INSERT INTO public.bookings(
    tenant_id, customer_id, booking_number, service_type, status,
    start_at, end_at, start_date, end_date, source, notes)
  VALUES (
    v_e.tenant_id, v_e.customer_id, v_num,
    COALESCE(v_e.service_type, 'hotel_dog'::public.service_type), 'confirmed',
    v_e.start_at, v_e.end_at, v_e.start_at::date, v_e.end_at::date,
    'staff_capture', 'Created from quote ' || COALESCE(v_e.estimate_number,''))
  RETURNING id INTO v_booking;

  FOREACH v_pet IN ARRAY COALESCE(v_e.pet_ids, '{}'::uuid[]) LOOP
    INSERT INTO public.booking_pets(tenant_id, booking_id, pet_id)
    VALUES (v_e.tenant_id, v_booking, v_pet)
    ON CONFLICT DO NOTHING;
  END LOOP;

  INSERT INTO public.hotel_booking_details(
    tenant_id, booking_id, accommodation_type,
    check_in_window, check_out_window, additional_notes)
  VALUES (
    v_e.tenant_id, v_booking, v_e.accommodation_type,
    NULLIF(v_e.extras->>'check_in_window',''),
    NULLIF(v_e.extras->>'check_out_window',''),
    NULLIF(v_e.extras->>'notes',''));

  -- surcharges chosen on the quote
  FOR v_s IN SELECT * FROM jsonb_array_elements(COALESCE(v_e.extras->'surcharges','[]'::jsonb))
  LOOP
    INSERT INTO public.hotel_booking_surcharges(tenant_id, booking_id, surcharge_id, quantity)
    VALUES (v_e.tenant_id, v_booking, (v_s->>'surcharge_id')::uuid,
            COALESCE((v_s->>'quantity')::numeric, 1));
  END LOOP;

  -- grooming requested during the stay
  IF COALESCE(v_e.extras->'pets', '[]'::jsonb) <> '[]'::jsonb THEN
    PERFORM public.sync_hotel_grooming_requests(v_booking, jsonb_build_object('pets', v_e.extras->'pets'));
  END IF;

  UPDATE public.estimates
     SET status = 'accepted', accepted_at = now(), booking_id = v_booking, updated_at = now()
   WHERE id = p_estimate_id;

  RETURN v_booking;
END; $function$;