-- ============ SETTINGS ============
ALTER TABLE public.hotel_workflow_settings
  ADD COLUMN IF NOT EXISTS deposit_split_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS checkout_groom_discount_pct numeric(5,2) NOT NULL DEFAULT 50,
  ADD COLUMN IF NOT EXISTS daycare_credit_enabled boolean NOT NULL DEFAULT true;

ALTER TABLE public.invoicing_settings
  ADD COLUMN IF NOT EXISTS estimate_prefix text NOT NULL DEFAULT 'QU-',
  ADD COLUMN IF NOT EXISTS next_estimate_number integer NOT NULL DEFAULT 1;

-- ============ INVOICES: deposit / balance ============
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS booking_id uuid REFERENCES public.bookings(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS invoice_kind text NOT NULL DEFAULT 'standard';

DO $$ BEGIN
  ALTER TABLE public.invoices ADD CONSTRAINT invoices_invoice_kind_chk
    CHECK (invoice_kind IN ('standard','deposit','balance'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS deposit_invoice_id uuid REFERENCES public.invoices(id) ON DELETE SET NULL;

-- ============ HOTEL BOOKING DETAILS: form tracking ============
ALTER TABLE public.hotel_booking_details
  ADD COLUMN IF NOT EXISTS form_submission_id uuid REFERENCES public.form_submissions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS form_received_at timestamptz;

-- ============ GROOMING: checkout-day discount ============
ALTER TABLE public.grooming_booking_details
  ADD COLUMN IF NOT EXISTS hotel_checkout_discount_pct numeric(5,2) NOT NULL DEFAULT 0;

-- ============ ESTIMATES (quotes) ============
ALTER TABLE public.estimates
  ADD COLUMN IF NOT EXISTS service_type public.service_type,
  ADD COLUMN IF NOT EXISTS start_at timestamptz,
  ADD COLUMN IF NOT EXISTS end_at timestamptz,
  ADD COLUMN IF NOT EXISTS accommodation_type text,
  ADD COLUMN IF NOT EXISTS pet_ids uuid[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS booking_id uuid REFERENCES public.bookings(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS declined_at timestamptz;

CREATE OR REPLACE FUNCTION public.next_estimate_number(target_tenant_id uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_prefix text; v_next integer;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext(target_tenant_id::text || ':estimate_number'));
  INSERT INTO public.invoicing_settings (tenant_id) VALUES (target_tenant_id)
    ON CONFLICT (tenant_id) DO NOTHING;
  UPDATE public.invoicing_settings
     SET next_estimate_number = next_estimate_number + 1
   WHERE tenant_id = target_tenant_id
   RETURNING estimate_prefix, next_estimate_number - 1 INTO v_prefix, v_next;
  RETURN COALESCE(v_prefix,'QU-') || lpad(v_next::text, 5, '0');
END; $$;

REVOKE EXECUTE ON FUNCTION public.next_estimate_number(uuid) FROM anon;

-- ============ DAYCARE CREDITS FOR HOTEL NIGHTS ============
CREATE TABLE IF NOT EXISTS public.hotel_daycare_credits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  booking_id uuid NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  pet_id uuid REFERENCES public.pets(id) ON DELETE SET NULL,
  enrolment_id uuid REFERENCES public.daycare_enrolments(id) ON DELETE SET NULL,
  nights integer NOT NULL DEFAULT 0,
  daily_rate_zar numeric(12,2) NOT NULL DEFAULT 0,
  amount_zar numeric(12,2) NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending',
  applied_invoice_id uuid REFERENCES public.invoices(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT hotel_daycare_credits_status_chk CHECK (status IN ('pending','applied','cancelled'))
);

CREATE UNIQUE INDEX IF NOT EXISTS hotel_daycare_credits_booking_pet_uidx
  ON public.hotel_daycare_credits(booking_id, COALESCE(pet_id, '00000000-0000-0000-0000-000000000000'::uuid));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.hotel_daycare_credits TO authenticated;
GRANT ALL ON public.hotel_daycare_credits TO service_role;

ALTER TABLE public.hotel_daycare_credits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff read tenant hotel daycare credits"
  ON public.hotel_daycare_credits FOR SELECT TO authenticated
  USING (public.user_has_tenant_access(tenant_id));

CREATE POLICY "Staff manage tenant hotel daycare credits"
  ON public.hotel_daycare_credits FOR ALL TO authenticated
  USING (public.user_has_tenant_access(tenant_id))
  WITH CHECK (public.user_has_tenant_access(tenant_id));

CREATE TRIGGER hotel_daycare_credits_set_updated_at
  BEFORE UPDATE ON public.hotel_daycare_credits
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============ DEPOSIT / BALANCE SPLIT ============
CREATE OR REPLACE FUNCTION public.sync_hotel_deposit_invoice(p_booking_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_b public.bookings;
  v_enabled boolean;
  v_pct numeric(5,2);
  v_lead integer;
  v_gross numeric(12,2);
  v_dep numeric(12,2);
  v_dep_inv uuid;
  v_num text;
  v_sort integer;
  v_checkin date;
BEGIN
  SELECT * INTO v_b FROM public.bookings WHERE id = p_booking_id;
  IF v_b.id IS NULL OR v_b.invoice_id IS NULL THEN RETURN; END IF;
  IF v_b.service_type::text NOT IN ('hotel_dog','hotel_cat') THEN RETURN; END IF;
  IF public._invoice_locked(v_b.invoice_id) THEN RETURN; END IF;

  SELECT COALESCE(deposit_split_enabled, true) INTO v_enabled
    FROM public.hotel_workflow_settings WHERE tenant_id = v_b.tenant_id LIMIT 1;
  IF NOT COALESCE(v_enabled, true) THEN RETURN; END IF;

  SELECT COALESCE(hotel_deposit_percent, 50), COALESCE(hotel_balance_due_days_before, 7)
    INTO v_pct, v_lead
    FROM public.policy_settings WHERE tenant_id = v_b.tenant_id LIMIT 1;
  v_pct  := COALESCE(v_pct, 50);
  v_lead := COALESCE(v_lead, 7);
  IF v_pct <= 0 OR v_pct >= 100 THEN RETURN; END IF;

  DELETE FROM public.invoice_items
   WHERE invoice_id = v_b.invoice_id AND source_type = 'hotel_deposit_offset';

  SELECT COALESCE(SUM(line_total),0) INTO v_gross
    FROM public.invoice_items WHERE invoice_id = v_b.invoice_id;
  IF v_gross <= 0 THEN RETURN; END IF;

  v_dep := ROUND(v_gross * v_pct / 100, 2);
  v_dep_inv := v_b.deposit_invoice_id;
  v_checkin := COALESCE(v_b.start_date, v_b.start_at::date);

  IF v_dep_inv IS NULL THEN
    v_num := public.next_invoice_number(v_b.tenant_id);
    INSERT INTO public.invoices(tenant_id, customer_id, booking_id, invoice_number, invoice_kind,
                                status, notes, issue_date, due_date)
    VALUES (v_b.tenant_id, v_b.customer_id, v_b.id, v_num, 'deposit', 'issued',
            'Deposit — booking ' || COALESCE(v_b.booking_number,''), CURRENT_DATE, CURRENT_DATE)
    RETURNING id INTO v_dep_inv;
    UPDATE public.bookings SET deposit_invoice_id = v_dep_inv WHERE id = v_b.id;
  END IF;

  IF NOT public._invoice_locked(v_dep_inv) THEN
    DELETE FROM public.invoice_items WHERE invoice_id = v_dep_inv AND source_type = 'hotel_deposit';
    INSERT INTO public.invoice_items(tenant_id, invoice_id, booking_id, description,
                                     quantity, unit_price, line_total, sort_order, source_type, source_id)
    VALUES (v_b.tenant_id, v_dep_inv, v_b.id,
            'Deposit (' || TRIM(TO_CHAR(v_pct,'FM990.99')) || '%) to secure booking '
              || COALESCE(v_b.booking_number,''),
            1, v_dep, v_dep, 1, 'hotel_deposit', v_b.id);
  END IF;

  SELECT COALESCE(MAX(sort_order),0)+1 INTO v_sort
    FROM public.invoice_items WHERE invoice_id = v_b.invoice_id;

  INSERT INTO public.invoice_items(tenant_id, invoice_id, booking_id, description,
                                   quantity, unit_price, line_total, sort_order, source_type, source_id)
  VALUES (v_b.tenant_id, v_b.invoice_id, v_b.id,
          'Less deposit already invoiced', 1, -v_dep, -v_dep, v_sort, 'hotel_deposit_offset', v_b.id);

  UPDATE public.invoices
     SET invoice_kind = 'balance',
         due_date = GREATEST(CURRENT_DATE, COALESCE(v_checkin, CURRENT_DATE) - v_lead),
         booking_id = COALESCE(booking_id, v_b.id),
         updated_at = now()
   WHERE id = v_b.invoice_id;
END; $$;

REVOKE EXECUTE ON FUNCTION public.sync_hotel_deposit_invoice(uuid) FROM anon;

-- ============ DAYCARE CREDIT CALC ============
CREATE OR REPLACE FUNCTION public.sync_hotel_daycare_credits(p_booking_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_b public.bookings;
  v_enabled boolean;
  v_start date; v_end date;
  r record;
  v_nights integer;
  v_daily numeric(12,2);
BEGIN
  SELECT * INTO v_b FROM public.bookings WHERE id = p_booking_id;
  IF v_b.id IS NULL OR v_b.service_type::text NOT IN ('hotel_dog','hotel_cat') THEN RETURN; END IF;

  SELECT COALESCE(daycare_credit_enabled, true) INTO v_enabled
    FROM public.hotel_workflow_settings WHERE tenant_id = v_b.tenant_id LIMIT 1;

  IF NOT COALESCE(v_enabled, true) OR v_b.status::text IN ('cancelled','no_show') THEN
    UPDATE public.hotel_daycare_credits
       SET status = 'cancelled', updated_at = now()
     WHERE booking_id = p_booking_id AND status = 'pending';
    RETURN;
  END IF;

  v_start := COALESCE(v_b.start_date, v_b.start_at::date);
  v_end   := COALESCE(v_b.end_date, v_b.end_at::date, v_start);

  FOR r IN
    SELECT e.id AS enrolment_id, e.pet_id, e.selected_days, dp.price, dp.days_per_week
      FROM public.booking_pets bp
      JOIN public.daycare_enrolments e
        ON e.pet_id = bp.pet_id AND e.tenant_id = v_b.tenant_id AND COALESCE(e.active,true)
      LEFT JOIN public.daycare_plans dp ON dp.id = e.daycare_plan_id
     WHERE bp.booking_id = v_b.id
       AND COALESCE(e.start_date, v_start) <= v_end
       AND (e.end_date IS NULL OR e.end_date >= v_start)
  LOOP
    SELECT COUNT(*) INTO v_nights
      FROM generate_series(v_start, GREATEST(v_start, v_end - 1), '1 day') d
     WHERE r.selected_days IS NULL
        OR array_length(r.selected_days, 1) IS NULL
        OR EXTRACT(ISODOW FROM d)::int = ANY(r.selected_days);

    v_daily := CASE WHEN COALESCE(r.days_per_week,0) > 0
                    THEN ROUND(COALESCE(r.price,0) / (r.days_per_week * 52.0 / 12.0), 2)
                    ELSE 0 END;

    IF v_nights > 0 AND v_daily > 0 THEN
      INSERT INTO public.hotel_daycare_credits(
        tenant_id, booking_id, customer_id, pet_id, enrolment_id, nights, daily_rate_zar, amount_zar, status)
      VALUES (v_b.tenant_id, v_b.id, v_b.customer_id, r.pet_id, r.enrolment_id,
              v_nights, v_daily, ROUND(v_nights * v_daily, 2), 'pending')
      ON CONFLICT (booking_id, COALESCE(pet_id, '00000000-0000-0000-0000-000000000000'::uuid))
      DO UPDATE SET nights = EXCLUDED.nights,
                    daily_rate_zar = EXCLUDED.daily_rate_zar,
                    amount_zar = EXCLUDED.amount_zar,
                    enrolment_id = EXCLUDED.enrolment_id,
                    status = CASE WHEN public.hotel_daycare_credits.status = 'applied'
                                  THEN 'applied' ELSE 'pending' END,
                    updated_at = now();
    END IF;
  END LOOP;
END; $$;

REVOKE EXECUTE ON FUNCTION public.sync_hotel_daycare_credits(uuid) FROM anon;

-- ============ CHECKOUT-DAY GROOM DISCOUNT ============
CREATE OR REPLACE FUNCTION public.grooming_checkout_discount_pct(p_booking_id uuid)
RETURNS numeric LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_b public.bookings;
  v_pct numeric(5,2);
  v_day date;
BEGIN
  SELECT * INTO v_b FROM public.bookings WHERE id = p_booking_id;
  IF v_b.id IS NULL THEN RETURN 0; END IF;
  IF v_b.service_type::text NOT IN ('grooming_inhouse','grooming_mobile') THEN RETURN 0; END IF;

  SELECT COALESCE(checkout_groom_discount_pct, 0) INTO v_pct
    FROM public.hotel_workflow_settings WHERE tenant_id = v_b.tenant_id LIMIT 1;
  IF COALESCE(v_pct,0) <= 0 THEN RETURN 0; END IF;

  v_day := COALESCE(v_b.start_date, v_b.start_at::date);

  IF EXISTS (
    SELECT 1 FROM public.bookings h
     WHERE h.tenant_id = v_b.tenant_id
       AND h.customer_id = v_b.customer_id
       AND h.service_type::text IN ('hotel_dog','hotel_cat')
       AND h.status::text NOT IN ('cancelled','no_show')
       AND COALESCE(h.end_date, h.end_at::date) = v_day
  ) THEN
    RETURN v_pct;
  END IF;
  RETURN 0;
END; $$;

REVOKE EXECUTE ON FUNCTION public.grooming_checkout_discount_pct(uuid) FROM anon;
