CREATE OR REPLACE FUNCTION public.sync_hotel_daycare_credits(p_booking_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
        OR lower(to_char(d, 'Dy')) = ANY (r.selected_days);

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
END; $function$;