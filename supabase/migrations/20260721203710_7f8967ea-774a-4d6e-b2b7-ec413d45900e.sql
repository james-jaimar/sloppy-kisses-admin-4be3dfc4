
-- 1. hotel_rate_cards -----------------------------------------------------
CREATE TABLE IF NOT EXISTS public.hotel_rate_cards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  species text NOT NULL CHECK (species IN ('dog','cat')),
  accommodation_type text NOT NULL,
  display_name text NOT NULL,
  nightly_rate_zar numeric(12,2) NOT NULL DEFAULT 0,
  peak_uplift_pct numeric(6,2) NOT NULL DEFAULT 0,
  extra_pet_rate_zar numeric(12,2) NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, species, accommodation_type)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.hotel_rate_cards TO authenticated;
GRANT ALL ON public.hotel_rate_cards TO service_role;
ALTER TABLE public.hotel_rate_cards ENABLE ROW LEVEL SECURITY;

CREATE POLICY hotel_rate_cards_select ON public.hotel_rate_cards
  FOR SELECT TO authenticated
  USING (public.user_has_tenant_access(tenant_id));
CREATE POLICY hotel_rate_cards_insert ON public.hotel_rate_cards
  FOR INSERT TO authenticated
  WITH CHECK (public.user_has_permission(tenant_id, 'settings.hotel.manage'));
CREATE POLICY hotel_rate_cards_update ON public.hotel_rate_cards
  FOR UPDATE TO authenticated
  USING (public.user_has_permission(tenant_id, 'settings.hotel.manage'))
  WITH CHECK (public.user_has_permission(tenant_id, 'settings.hotel.manage'));
CREATE POLICY hotel_rate_cards_delete ON public.hotel_rate_cards
  FOR DELETE TO authenticated
  USING (public.user_has_permission(tenant_id, 'settings.hotel.manage'));

CREATE TRIGGER trg_hotel_rate_cards_updated_at
  BEFORE UPDATE ON public.hotel_rate_cards
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 2. hotel_surcharges -----------------------------------------------------
CREATE TABLE IF NOT EXISTS public.hotel_surcharges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  code text NOT NULL,
  name text NOT NULL,
  price_zar numeric(12,2) NOT NULL DEFAULT 0,
  per_night boolean NOT NULL DEFAULT false,
  active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, code)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.hotel_surcharges TO authenticated;
GRANT ALL ON public.hotel_surcharges TO service_role;
ALTER TABLE public.hotel_surcharges ENABLE ROW LEVEL SECURITY;

CREATE POLICY hotel_surcharges_select ON public.hotel_surcharges
  FOR SELECT TO authenticated
  USING (public.user_has_tenant_access(tenant_id));
CREATE POLICY hotel_surcharges_insert ON public.hotel_surcharges
  FOR INSERT TO authenticated
  WITH CHECK (public.user_has_permission(tenant_id, 'settings.hotel.manage'));
CREATE POLICY hotel_surcharges_update ON public.hotel_surcharges
  FOR UPDATE TO authenticated
  USING (public.user_has_permission(tenant_id, 'settings.hotel.manage'))
  WITH CHECK (public.user_has_permission(tenant_id, 'settings.hotel.manage'));
CREATE POLICY hotel_surcharges_delete ON public.hotel_surcharges
  FOR DELETE TO authenticated
  USING (public.user_has_permission(tenant_id, 'settings.hotel.manage'));

CREATE TRIGGER trg_hotel_surcharges_updated_at
  BEFORE UPDATE ON public.hotel_surcharges
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 3. hotel_booking_surcharges (per-booking selection) ---------------------
CREATE TABLE IF NOT EXISTS public.hotel_booking_surcharges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  booking_id uuid NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  surcharge_id uuid NOT NULL REFERENCES public.hotel_surcharges(id) ON DELETE RESTRICT,
  quantity numeric(6,2) NOT NULL DEFAULT 1,
  price_override_zar numeric(12,2),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (booking_id, surcharge_id)
);
CREATE INDEX IF NOT EXISTS hotel_booking_surcharges_booking_idx
  ON public.hotel_booking_surcharges(booking_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.hotel_booking_surcharges TO authenticated;
GRANT ALL ON public.hotel_booking_surcharges TO service_role;
ALTER TABLE public.hotel_booking_surcharges ENABLE ROW LEVEL SECURITY;

CREATE POLICY hotel_booking_surcharges_select ON public.hotel_booking_surcharges
  FOR SELECT TO authenticated
  USING (public.user_has_tenant_access(tenant_id));
CREATE POLICY hotel_booking_surcharges_insert ON public.hotel_booking_surcharges
  FOR INSERT TO authenticated
  WITH CHECK (public.user_has_permission(tenant_id, 'bookings.edit'));
CREATE POLICY hotel_booking_surcharges_update ON public.hotel_booking_surcharges
  FOR UPDATE TO authenticated
  USING (public.user_has_permission(tenant_id, 'bookings.edit'))
  WITH CHECK (public.user_has_permission(tenant_id, 'bookings.edit'));
CREATE POLICY hotel_booking_surcharges_delete ON public.hotel_booking_surcharges
  FOR DELETE TO authenticated
  USING (public.user_has_permission(tenant_id, 'bookings.edit'));

-- 4. Peak-season window on hotel_workflow_settings ------------------------
ALTER TABLE public.hotel_workflow_settings
  ADD COLUMN IF NOT EXISTS peak_start_month_day text,   -- 'MM-DD'
  ADD COLUMN IF NOT EXISTS peak_end_month_day text;

-- 5. Rewrite hotel auto-invoice trigger -----------------------------------
CREATE OR REPLACE FUNCTION public.hotel_details_auto_invoice()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_booking public.bookings;
  v_species text;
  v_pet_name text;
  v_pet_count integer := 1;
  v_nights integer;
  v_inv uuid; v_sort integer;
  v_ps date; v_pe date; v_period_label text; v_anchor date;
  v_rate public.hotel_rate_cards;
  v_uplift numeric(6,2) := 0;
  v_peak_start text; v_peak_end text;
  v_nightly numeric(12,2);
  v_line_total numeric(12,2);
  v_pets_over_first integer;
  r record;
  v_qty numeric(6,2);
  v_price numeric(12,2);
BEGIN
  SELECT * INTO v_booking FROM public.bookings WHERE id = NEW.booking_id;
  IF v_booking.id IS NULL THEN RETURN NEW; END IF;
  IF NOT COALESCE(public._auto_invoice_enabled(NEW.tenant_id, 'hotel'), true) THEN RETURN NEW; END IF;

  -- If there's already a linked invoice, strip previous hotel lines for this booking so we can re-price
  IF v_booking.invoice_id IS NOT NULL THEN
    DELETE FROM public.invoice_items
     WHERE booking_id = v_booking.id
       AND invoice_id = v_booking.invoice_id;
  END IF;

  v_anchor := COALESCE(v_booking.start_date, v_booking.start_at::date, now()::date);
  SELECT period_start, period_end INTO v_ps, v_pe FROM public._period_bounds(v_anchor);
  v_period_label := to_char(v_ps, 'Mon YYYY');

  v_nights := GREATEST(1, COALESCE(
    (v_booking.end_date - v_booking.start_date),
    (EXTRACT(EPOCH FROM (v_booking.end_at - v_booking.start_at))/86400)::int,
    1));

  v_species := CASE WHEN v_booking.service_type::text = 'hotel_cat' THEN 'cat' ELSE 'dog' END;

  SELECT * INTO v_rate FROM public.hotel_rate_cards
   WHERE tenant_id = NEW.tenant_id
     AND species = v_species
     AND accommodation_type = COALESCE(NEW.accommodation_type, '')
     AND active = true
   LIMIT 1;

  v_nightly := COALESCE(v_rate.nightly_rate_zar, 0);

  SELECT peak_start_month_day, peak_end_month_day
    INTO v_peak_start, v_peak_end
  FROM public.hotel_workflow_settings WHERE tenant_id = NEW.tenant_id LIMIT 1;

  IF v_peak_start IS NOT NULL AND v_peak_end IS NOT NULL AND COALESCE(v_rate.peak_uplift_pct,0) > 0 THEN
    IF EXISTS (
      SELECT 1 FROM generate_series(
        COALESCE(v_booking.start_date, v_booking.start_at::date),
        COALESCE(v_booking.end_date, v_booking.end_at::date) - 1,
        '1 day') d
      WHERE to_char(d, 'MM-DD') BETWEEN v_peak_start AND v_peak_end
    ) THEN
      v_uplift := v_rate.peak_uplift_pct;
    END IF;
  END IF;

  IF v_uplift > 0 THEN
    v_nightly := ROUND(v_nightly * (1 + v_uplift/100), 2);
  END IF;

  SELECT COUNT(*) INTO v_pet_count FROM public.booking_pets WHERE booking_id = v_booking.id;
  IF v_pet_count = 0 THEN v_pet_count := 1; END IF;

  SELECT p.name INTO v_pet_name
    FROM public.booking_pets bp JOIN public.pets p ON p.id = bp.pet_id
   WHERE bp.booking_id = v_booking.id
   ORDER BY p.name LIMIT 1;

  v_inv := public.ensure_draft_invoice(v_booking.tenant_id, v_booking.customer_id, v_ps, v_pe, 'Services — ' || v_period_label);
  UPDATE public.bookings SET invoice_id = v_inv WHERE id = v_booking.id;

  SELECT COALESCE(MAX(sort_order),0)+1 INTO v_sort FROM public.invoice_items WHERE invoice_id = v_inv;

  v_line_total := ROUND(v_nightly * v_nights, 2);
  INSERT INTO public.invoice_items(tenant_id, invoice_id, booking_id, description, quantity, unit_price, line_total, sort_order)
  VALUES (v_booking.tenant_id, v_inv, v_booking.id,
    'Hotel stay — ' || COALESCE(v_rate.display_name, NEW.accommodation_type, 'boarding')
      || CASE WHEN v_pet_name IS NOT NULL THEN ' (' || v_pet_name || ')' ELSE '' END
      || ' · ' || v_nights || ' night' || CASE WHEN v_nights = 1 THEN '' ELSE 's' END
      || CASE WHEN v_uplift > 0 THEN ' · peak +' || v_uplift || '%' ELSE '' END,
    v_nights, v_nightly, v_line_total, v_sort);
  v_sort := v_sort + 1;

  v_pets_over_first := GREATEST(0, v_pet_count - 1);
  IF v_pets_over_first > 0 AND COALESCE(v_rate.extra_pet_rate_zar, 0) > 0 THEN
    INSERT INTO public.invoice_items(tenant_id, invoice_id, booking_id, description, quantity, unit_price, line_total, sort_order)
    VALUES (v_booking.tenant_id, v_inv, v_booking.id,
      'Extra pet in same room · ' || v_nights || ' night' || CASE WHEN v_nights = 1 THEN '' ELSE 's' END,
      v_pets_over_first * v_nights,
      v_rate.extra_pet_rate_zar,
      ROUND(v_rate.extra_pet_rate_zar * v_pets_over_first * v_nights, 2),
      v_sort);
    v_sort := v_sort + 1;
  END IF;

  FOR r IN
    SELECT bs.quantity, COALESCE(bs.price_override_zar, s.price_zar) AS unit_price, s.name, s.per_night
    FROM public.hotel_booking_surcharges bs
    JOIN public.hotel_surcharges s ON s.id = bs.surcharge_id
    WHERE bs.booking_id = v_booking.id
  LOOP
    v_qty := r.quantity * CASE WHEN r.per_night THEN v_nights ELSE 1 END;
    v_price := r.unit_price;
    INSERT INTO public.invoice_items(tenant_id, invoice_id, booking_id, description, quantity, unit_price, line_total, sort_order)
    VALUES (v_booking.tenant_id, v_inv, v_booking.id,
      r.name || CASE WHEN r.per_night THEN ' · ' || v_nights || ' night' || CASE WHEN v_nights = 1 THEN '' ELSE 's' END ELSE '' END,
      v_qty, v_price, ROUND(v_qty * v_price, 2), v_sort);
    v_sort := v_sort + 1;
  END LOOP;

  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.hotel_details_auto_invoice() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_hotel_details_auto_invoice ON public.hotel_booking_details;
CREATE TRIGGER trg_hotel_details_auto_invoice
AFTER INSERT OR UPDATE OF accommodation_type ON public.hotel_booking_details
FOR EACH ROW EXECUTE FUNCTION public.hotel_details_auto_invoice();

-- Re-run when the booking dates change
CREATE OR REPLACE FUNCTION public.hotel_booking_dates_reprice()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NEW.service_type::text NOT IN ('hotel_dog','hotel_cat') THEN RETURN NEW; END IF;
  IF (OLD.start_date IS DISTINCT FROM NEW.start_date)
     OR (OLD.end_date IS DISTINCT FROM NEW.end_date)
     OR (OLD.start_at IS DISTINCT FROM NEW.start_at)
     OR (OLD.end_at IS DISTINCT FROM NEW.end_at) THEN
    -- Nudge the hotel_booking_details row so the AFTER UPDATE trigger fires
    UPDATE public.hotel_booking_details
       SET accommodation_type = accommodation_type
     WHERE booking_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.hotel_booking_dates_reprice() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_hotel_booking_dates_reprice ON public.bookings;
CREATE TRIGGER trg_hotel_booking_dates_reprice
AFTER UPDATE OF start_date, end_date, start_at, end_at ON public.bookings
FOR EACH ROW EXECUTE FUNCTION public.hotel_booking_dates_reprice();

-- Re-run when surcharges change
CREATE OR REPLACE FUNCTION public.hotel_surcharge_change_reprice()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_booking_id uuid;
BEGIN
  v_booking_id := COALESCE(NEW.booking_id, OLD.booking_id);
  UPDATE public.hotel_booking_details
     SET accommodation_type = accommodation_type
   WHERE booking_id = v_booking_id;
  RETURN COALESCE(NEW, OLD);
END;
$$;
REVOKE ALL ON FUNCTION public.hotel_surcharge_change_reprice() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_hotel_surcharge_reprice ON public.hotel_booking_surcharges;
CREATE TRIGGER trg_hotel_surcharge_reprice
AFTER INSERT OR UPDATE OR DELETE ON public.hotel_booking_surcharges
FOR EACH ROW EXECUTE FUNCTION public.hotel_surcharge_change_reprice();

-- 6. Vaccination gate check ----------------------------------------------
CREATE OR REPLACE FUNCTION public.hotel_can_confirm_booking(p_booking_id uuid)
RETURNS TABLE(pet_id uuid, pet_name text, vaccine_type text, status text, expiry_date date)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_booking public.bookings;
BEGIN
  SELECT * INTO v_booking FROM public.bookings WHERE id = p_booking_id;
  IF v_booking.id IS NULL THEN RETURN; END IF;

  RETURN QUERY
  WITH pets_on_booking AS (
    SELECT p.id AS pet_id, p.name AS pet_name, p.species::text AS species
    FROM public.booking_pets bp
    JOIN public.pets p ON p.id = bp.pet_id
    WHERE bp.booking_id = p_booking_id
  ),
  required_rules AS (
    SELECT r.vaccine_type, r.species::text AS species, COALESCE(r.grace_days, 0) AS grace_days
    FROM public.vaccination_rules r
    WHERE r.tenant_id = v_booking.tenant_id
      AND r.service_type::text = v_booking.service_type::text
      AND r.required = true
  ),
  latest_vax AS (
    SELECT DISTINCT ON (v.pet_id, v.vaccination_type)
      v.pet_id, v.vaccination_type, v.expiry_date, v.verified
    FROM public.vaccinations v
    ORDER BY v.pet_id, v.vaccination_type, v.administered_date DESC NULLS LAST
  )
  SELECT
    p.pet_id, p.pet_name, r.vaccine_type,
    CASE
      WHEN lv.pet_id IS NULL THEN 'missing'
      WHEN lv.expiry_date IS NULL THEN 'no_expiry'
      WHEN lv.expiry_date < (COALESCE(v_booking.start_date, now()::date) - (r.grace_days || ' days')::interval)::date THEN 'expired'
      WHEN lv.verified = false THEN 'unverified'
      ELSE 'ok'
    END AS status,
    lv.expiry_date
  FROM pets_on_booking p
  CROSS JOIN required_rules r
  LEFT JOIN latest_vax lv ON lv.pet_id = p.pet_id AND lv.vaccination_type::text = r.vaccine_type::text
  WHERE (r.species = p.species OR r.species = 'any')
  ORDER BY p.pet_name, r.vaccine_type;
END;
$$;
REVOKE ALL ON FUNCTION public.hotel_can_confirm_booking(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hotel_can_confirm_booking(uuid) TO authenticated;
