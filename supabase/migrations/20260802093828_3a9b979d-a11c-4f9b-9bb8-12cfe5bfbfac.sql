CREATE OR REPLACE FUNCTION public.portal_cancel_booking(p_booking_id uuid, p_reason text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_b public.bookings;
  v_cust uuid;
BEGIN
  SELECT * INTO v_b FROM public.bookings WHERE id = p_booking_id;
  IF v_b.id IS NULL THEN RAISE EXCEPTION 'Booking not found'; END IF;

  v_cust := public.current_customer_id(v_b.tenant_id);
  IF v_cust IS NULL OR v_cust <> v_b.customer_id THEN
    RAISE EXCEPTION 'Not authorised to cancel this booking';
  END IF;

  IF v_b.status::text IN ('cancelled','completed','checked_out','no_show') THEN
    RAISE EXCEPTION 'This booking can no longer be cancelled';
  END IF;

  UPDATE public.bookings
     SET status = 'cancelled'::public.booking_status,
         notes_internal = COALESCE(notes_internal || E'\n', '')
           || 'Cancelled by customer via portal'
           || CASE WHEN p_reason IS NOT NULL AND length(trim(p_reason)) > 0
                   THEN ': ' || trim(p_reason) ELSE '' END,
         updated_at = now()
   WHERE id = p_booking_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.portal_reschedule_booking(
  p_booking_id uuid,
  p_start_at timestamptz,
  p_end_at timestamptz DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_b public.bookings;
  v_cust uuid;
BEGIN
  SELECT * INTO v_b FROM public.bookings WHERE id = p_booking_id;
  IF v_b.id IS NULL THEN RAISE EXCEPTION 'Booking not found'; END IF;

  v_cust := public.current_customer_id(v_b.tenant_id);
  IF v_cust IS NULL OR v_cust <> v_b.customer_id THEN
    RAISE EXCEPTION 'Not authorised to change this booking';
  END IF;

  IF v_b.status::text IN ('cancelled','completed','checked_out','no_show') THEN
    RAISE EXCEPTION 'This booking can no longer be moved';
  END IF;

  IF p_start_at IS NULL OR p_start_at < now() THEN
    RAISE EXCEPTION 'Please choose a future date and time';
  END IF;

  IF p_end_at IS NOT NULL AND p_end_at <= p_start_at THEN
    RAISE EXCEPTION 'The end time must be after the start time';
  END IF;

  UPDATE public.bookings
     SET start_at = p_start_at,
         end_at = COALESCE(p_end_at, CASE WHEN v_b.end_at IS NULL THEN NULL
                                          ELSE p_start_at + (v_b.end_at - v_b.start_at) END),
         start_date = (p_start_at AT TIME ZONE 'Africa/Johannesburg')::date,
         end_date = CASE
           WHEN COALESCE(p_end_at, CASE WHEN v_b.end_at IS NULL THEN NULL
                                        ELSE p_start_at + (v_b.end_at - v_b.start_at) END) IS NULL THEN NULL
           ELSE (COALESCE(p_end_at, p_start_at + (v_b.end_at - v_b.start_at)) AT TIME ZONE 'Africa/Johannesburg')::date
         END,
         notes_internal = COALESCE(notes_internal || E'\n', '')
           || 'Moved by customer via portal (was ' || to_char(v_b.start_at, 'YYYY-MM-DD HH24:MI') || ')',
         updated_at = now()
   WHERE id = p_booking_id;
END;
$$;

REVOKE ALL ON FUNCTION public.portal_cancel_booking(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.portal_reschedule_booking(uuid, timestamptz, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.portal_cancel_booking(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.portal_reschedule_booking(uuid, timestamptz, timestamptz) TO authenticated;