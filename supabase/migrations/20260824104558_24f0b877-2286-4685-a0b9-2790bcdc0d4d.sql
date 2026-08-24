-- 1. Parent/child link between bookings
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS parent_booking_id uuid REFERENCES public.bookings(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS link_kind text;

CREATE INDEX IF NOT EXISTS bookings_parent_booking_id_idx ON public.bookings(parent_booking_id);

-- Backfill existing checkout-day grooms
UPDATE public.bookings b
   SET parent_booking_id = r.hotel_booking_id,
       link_kind = 'hotel_checkout_groom'
  FROM public.hotel_grooming_requests r
 WHERE r.grooming_booking_id = b.id
   AND b.parent_booking_id IS NULL;

-- 2. Transport settings
ALTER TABLE public.transport_workflow_settings
  ADD COLUMN IF NOT EXISTS auto_create_hotel_legs boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS hotel_pickup_time time NOT NULL DEFAULT '09:00',
  ADD COLUMN IF NOT EXISTS hotel_dropoff_time time NOT NULL DEFAULT '16:00';

-- 3. Strip a leg's auto invoice lines when the invoice is still open
CREATE OR REPLACE FUNCTION public._strip_transport_leg_lines(p_leg_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT DISTINCT i.id
      FROM public.invoice_items ii
      JOIN public.invoices i ON i.id = ii.invoice_id
     WHERE ii.booking_id = p_leg_id
  LOOP
    IF public._invoice_locked(r.id) THEN CONTINUE; END IF;
    DELETE FROM public.invoice_items WHERE invoice_id = r.id AND booking_id = p_leg_id;
    UPDATE public.invoices i SET
      subtotal    = (SELECT COALESCE(SUM(line_total),0) FROM public.invoice_items WHERE invoice_id = i.id),
      total       = (SELECT COALESCE(SUM(line_total),0) FROM public.invoice_items WHERE invoice_id = i.id),
      balance_due = (SELECT COALESCE(SUM(line_total),0) FROM public.invoice_items WHERE invoice_id = i.id) - i.amount_paid,
      updated_at  = now()
    WHERE i.id = r.id;
  END LOOP;
END; $$;

REVOKE EXECUTE ON FUNCTION public._strip_transport_leg_lines(uuid) FROM anon, authenticated;

-- 4. Keep hotel transport legs in step with the stay
CREATE OR REPLACE FUNCTION public.sync_hotel_transport_legs(p_hotel_booking_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_b public.bookings;
  v_d public.hotel_booking_details;
  v_s public.transport_workflow_settings;
  v_addr uuid;
  v_place text;
  v_suburb text;
  v_dir text;
  v_want boolean;
  v_dead boolean;
  v_day date;
  v_time time;
  v_start timestamptz;
  v_leg uuid;
  v_leg_status text;
  v_status public.booking_status;
  v_num text;
  v_inv uuid;
BEGIN
  SELECT * INTO v_b FROM public.bookings WHERE id = p_hotel_booking_id;
  IF v_b.id IS NULL OR v_b.service_type::text NOT IN ('hotel_dog','hotel_cat') THEN RETURN; END IF;

  SELECT * INTO v_d FROM public.hotel_booking_details WHERE booking_id = p_hotel_booking_id;
  SELECT * INTO v_s FROM public.transport_workflow_settings WHERE tenant_id = v_b.tenant_id LIMIT 1;
  IF NOT COALESCE(v_s.auto_create_hotel_legs, true) THEN RETURN; END IF;

  v_dead := v_b.status::text IN ('cancelled','no_show');

  -- Address: the stay's service address, else the customer's primary address
  v_addr := v_b.service_address_id;
  IF v_addr IS NULL THEN
    SELECT id INTO v_addr FROM public.customer_addresses
     WHERE customer_id = v_b.customer_id
     ORDER BY is_primary DESC NULLS LAST, created_at
     LIMIT 1;
  END IF;
  SELECT place_id, suburb INTO v_place, v_suburb FROM public.customer_addresses WHERE id = v_addr;
  v_place := COALESCE(v_place, v_b.service_place_id);
  v_suburb := COALESCE(v_suburb, v_b.service_suburb);

  FOREACH v_dir IN ARRAY ARRAY['pickup','dropoff'] LOOP
    IF v_dir = 'pickup' THEN
      v_want := COALESCE(v_d.pickup_required, false);
      v_day  := COALESCE(v_b.start_date, v_b.start_at::date);
      v_time := COALESCE(v_s.hotel_pickup_time, '09:00'::time);
    ELSE
      v_want := COALESCE(v_d.dropoff_required, false);
      v_day  := COALESCE(v_b.end_date, v_b.end_at::date, v_b.start_date, v_b.start_at::date);
      v_time := COALESCE(v_s.hotel_dropoff_time, '16:00'::time);
    END IF;

    SELECT id, status::text INTO v_leg, v_leg_status
      FROM public.bookings
     WHERE parent_booking_id = v_b.id
       AND link_kind = 'hotel_transport_' || v_dir
     ORDER BY created_at
     LIMIT 1;

    -- Not wanted (or stay is dead): cancel any existing leg and clear its charges
    IF NOT v_want OR v_dead OR v_day IS NULL THEN
      IF v_leg IS NOT NULL AND v_leg_status <> 'cancelled' THEN
        PERFORM public._strip_transport_leg_lines(v_leg);
        UPDATE public.bookings
           SET status = 'cancelled'::public.booking_status,
               cancellation_fee_waived = true,
               cancellation_reason = COALESCE(cancellation_reason,
                 'Auto-cancelled with hotel booking ' || COALESCE(v_b.booking_number,'')),
               payment_hold_expires_at = NULL,
               updated_at = now()
         WHERE id = v_leg;
      END IF;
      CONTINUE;
    END IF;

    v_start := (v_day::text || ' ' || v_time::text)::timestamp AT TIME ZONE 'Africa/Johannesburg';
    v_status := CASE WHEN v_b.status::text IN ('pending_payment','requested','needs_info','draft')
                     THEN v_b.status
                     ELSE 'confirmed'::public.booking_status END;

    IF v_leg IS NULL THEN
      v_inv := v_b.invoice_id;
      v_num := public.next_booking_number(v_b.tenant_id);

      INSERT INTO public.bookings(
        tenant_id, customer_id, booking_number, service_type, status, source,
        start_at, end_at, start_date, end_date,
        service_address_id, service_place_id, service_suburb,
        invoice_id, parent_booking_id, link_kind, notes_internal, deposit_waived
      ) VALUES (
        v_b.tenant_id, v_b.customer_id, v_num, 'pickup_dropoff', v_status, v_b.source,
        v_start, v_start + interval '30 minutes', v_day, v_day,
        v_addr, v_place, v_suburb,
        v_inv, v_b.id, 'hotel_transport_' || v_dir,
        CASE WHEN v_dir = 'pickup' THEN 'Collection for hotel booking ' ELSE 'Return home for hotel booking ' END
          || COALESCE(v_b.booking_number,''),
        true
      ) RETURNING id INTO v_leg;

      INSERT INTO public.booking_pets(tenant_id, booking_id, pet_id)
      SELECT v_b.tenant_id, v_leg, bp.pet_id FROM public.booking_pets bp WHERE bp.booking_id = v_b.id;

      -- transport_details insert also prices the leg onto the stay's invoice
      INSERT INTO public.transport_details(
        tenant_id, booking_id, direction, suburb,
        pickup_address_id, pickup_place_id, dropoff_address_id, dropoff_place_id,
        planned_window_start, planned_window_end, driver_notes
      ) VALUES (
        v_b.tenant_id, v_leg, v_dir, v_suburb,
        CASE WHEN v_dir = 'pickup' THEN v_addr END,
        CASE WHEN v_dir = 'pickup' THEN v_place END,
        CASE WHEN v_dir = 'dropoff' THEN v_addr END,
        CASE WHEN v_dir = 'dropoff' THEN v_place END,
        v_start, v_start + interval '30 minutes',
        'Auto-created from hotel booking ' || COALESCE(v_b.booking_number,'')
      );
    ELSE
      UPDATE public.bookings
         SET start_at = v_start,
             end_at = v_start + interval '30 minutes',
             start_date = v_day,
             end_date = v_day,
             service_address_id = COALESCE(v_addr, service_address_id),
             service_place_id = COALESCE(v_place, service_place_id),
             service_suburb = COALESCE(v_suburb, service_suburb),
             status = CASE WHEN status::text IN ('checked_in','in_progress','completed','checked_out')
                           THEN status ELSE v_status END,
             updated_at = now()
       WHERE id = v_leg;

      UPDATE public.transport_details
         SET suburb = COALESCE(v_suburb, suburb),
             pickup_address_id  = CASE WHEN v_dir = 'pickup'  THEN COALESCE(v_addr, pickup_address_id)  ELSE pickup_address_id END,
             dropoff_address_id = CASE WHEN v_dir = 'dropoff' THEN COALESCE(v_addr, dropoff_address_id) ELSE dropoff_address_id END,
             planned_window_start = v_start,
             planned_window_end = v_start + interval '30 minutes',
             updated_at = now()
       WHERE booking_id = v_leg;
    END IF;
  END LOOP;
END; $$;

REVOKE EXECUTE ON FUNCTION public.sync_hotel_transport_legs(uuid) FROM anon;

-- 5. Triggers that call the sync
CREATE OR REPLACE FUNCTION public.hotel_booking_transport_sync()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.service_type::text IN ('hotel_dog','hotel_cat') THEN
    PERFORM public.sync_hotel_transport_legs(NEW.id);
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_hotel_booking_transport_sync ON public.bookings;
CREATE TRIGGER trg_hotel_booking_transport_sync
AFTER INSERT OR UPDATE OF start_at, end_at, start_date, end_date, status, requires_transport, service_address_id
ON public.bookings
FOR EACH ROW EXECUTE FUNCTION public.hotel_booking_transport_sync();

CREATE OR REPLACE FUNCTION public.hotel_details_transport_sync()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  PERFORM public.sync_hotel_transport_legs(NEW.booking_id);
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_hotel_details_transport_sync ON public.hotel_booking_details;
CREATE TRIGGER trg_hotel_details_transport_sync
AFTER INSERT OR UPDATE OF pickup_required, dropoff_required
ON public.hotel_booking_details
FOR EACH ROW EXECUTE FUNCTION public.hotel_details_transport_sync();

-- 6. Cancel linked child bookings when the parent dies
CREATE OR REPLACE FUNCTION public.bookings_cancel_linked_children()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE r record;
BEGIN
  IF NEW.status::text NOT IN ('cancelled','no_show') THEN RETURN NEW; END IF;
  IF OLD.status::text = NEW.status::text THEN RETURN NEW; END IF;

  FOR r IN
    SELECT id FROM public.bookings
     WHERE parent_booking_id = NEW.id
       AND status::text NOT IN ('cancelled','no_show','completed','checked_out')
  LOOP
    PERFORM public._strip_transport_leg_lines(r.id);
    UPDATE public.bookings
       SET status = 'cancelled'::public.booking_status,
           cancellation_fee_waived = true,
           cancellation_reason = COALESCE(cancellation_reason,
             'Auto-cancelled with booking ' || COALESCE(NEW.booking_number,'')),
           payment_hold_expires_at = NULL,
           updated_at = now()
     WHERE id = r.id;

    UPDATE public.hotel_grooming_requests
       SET status = 'cancelled', updated_at = now()
     WHERE grooming_booking_id = r.id
       AND status <> 'cancelled';
  END LOOP;

  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_bookings_cancel_linked_children ON public.bookings;
CREATE TRIGGER trg_bookings_cancel_linked_children
AFTER UPDATE OF status ON public.bookings
FOR EACH ROW EXECUTE FUNCTION public.bookings_cancel_linked_children();