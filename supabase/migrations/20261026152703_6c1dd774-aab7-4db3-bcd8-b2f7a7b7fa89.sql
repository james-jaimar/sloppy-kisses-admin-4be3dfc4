ALTER TABLE public.hotel_booking_details ADD COLUMN IF NOT EXISTS separate_rooms boolean NOT NULL DEFAULT false;

DO $mig$
DECLARE d text;
BEGIN
  -- 1. Pricing: group by optional room_group so pets in separate rooms each pay the full nightly rate.
  d := pg_get_functiondef('public.hotel_stay_lines_pets(uuid,text,date,date,jsonb)'::regprocedure);
  d := replace(d, $x$COALESCE(NULLIF(e->>'accommodation_type',''), '') AS acc,$x$,
                  $x$COALESCE(NULLIF(e->>'accommodation_type',''), '') AS acc,
           COALESCE(e->>'room_group', '') AS room_group,$x$);
  d := replace(d, 'GROUP BY 1, 2', 'GROUP BY 1, 2, 3');
  IF d NOT LIKE '%GROUP BY 1, 2, 3%' THEN RAISE EXCEPTION 'stay lines patch failed'; END IF;
  EXECUTE d;

  -- 2. Booking stay lines.
  d := pg_get_functiondef('public.hotel_booking_stay_lines(uuid)'::regprocedure);
  d := replace(d, $x$'accommodation_type',COALESCE(bp.accommodation_type,h.accommodation_type))$x$,
                  $x$'accommodation_type',COALESCE(bp.accommodation_type,h.accommodation_type),'room_group',CASE WHEN h.separate_rooms THEN p.id::text END)$x$);
  IF d NOT LIKE '%room_group%' THEN RAISE EXCEPTION 'booking stay lines patch failed'; END IF;
  EXECUTE d;

  -- 3. Auto invoice.
  d := pg_get_functiondef('public.hotel_details_auto_invoice()'::regprocedure);
  d := replace(d, $x$'accommodation_type', COALESCE(NULLIF(bp.accommodation_type,''), NEW.accommodation_type))$x$,
                  $x$'accommodation_type', COALESCE(NULLIF(bp.accommodation_type,''), NEW.accommodation_type),
           'room_group', CASE WHEN NEW.separate_rooms THEN p.id::text END)$x$);
  IF d NOT LIKE '%room_group%' THEN RAISE EXCEPTION 'auto invoice patch failed'; END IF;
  EXECUTE d;

  -- 4. Pet removal credit.
  d := pg_get_functiondef('hotel_private.draft_hotel_pet_removal_credit(uuid,jsonb)'::regprocedure);
  d := replace(d, $x$'accommodation_type', COALESCE(bp.accommodation_type, ''), 'pet_id', p.id)$x$,
                  $x$'accommodation_type', COALESCE(bp.accommodation_type, ''), 'pet_id', p.id,
           'room_group', CASE WHEN (SELECT separate_rooms FROM public.hotel_booking_details WHERE booking_id = b.id) THEN p.id::text END)$x$);
  IF d NOT LIKE '%room_group%' THEN RAISE EXCEPTION 'credit patch failed'; END IF;
  EXECUTE d;

  -- 5. Accepted quotes carry the choice.
  d := pg_get_functiondef('public.accept_estimate'::regproc);
  d := replace(d, $x$check_in_window, check_out_window, additional_notes)
  VALUES (
    v_e.tenant_id, v_booking, v_e.accommodation_type,
    NULLIF(v_e.extras->>'check_in_window',''),
    NULLIF(v_e.extras->>'check_out_window',''),
    NULLIF(v_e.extras->>'notes',''));$x$,
  $x$check_in_window, check_out_window, additional_notes, separate_rooms)
  VALUES (
    v_e.tenant_id, v_booking, v_e.accommodation_type,
    NULLIF(v_e.extras->>'check_in_window',''),
    NULLIF(v_e.extras->>'check_out_window',''),
    NULLIF(v_e.extras->>'notes',''),
    COALESCE((v_e.extras->>'separate_rooms')::boolean, false));$x$);
  IF d NOT LIKE '%separate_rooms%' THEN RAISE EXCEPTION 'accept estimate patch failed'; END IF;
  EXECUTE d;
END $mig$;

DROP TRIGGER IF EXISTS trg_hotel_details_auto_invoice ON public.hotel_booking_details;
CREATE TRIGGER trg_hotel_details_auto_invoice AFTER INSERT OR UPDATE OF accommodation_type, separate_rooms
  ON public.hotel_booking_details FOR EACH ROW EXECUTE FUNCTION public.hotel_details_auto_invoice();