ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS amendment_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cancellation_fee_waived boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS cancellation_fee_zar numeric(12,2),
  ADD COLUMN IF NOT EXISTS cancellation_fee_note text;

-- What would cancelling this booking cost, right now?
CREATE OR REPLACE FUNCTION public.booking_cancellation_quote(p_booking_id uuid, p_at timestamptz DEFAULT now())
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  b public.bookings;
  ps public.policy_settings;
  v_pct numeric := 0;
  v_base numeric(12,2) := 0;
  v_hours numeric := 0;
  v_window numeric := 0;
  v_within boolean := false;
  v_basis text := 'none';
  v_gr_pct numeric;
  v_gr_hours numeric;
BEGIN
  SELECT * INTO b FROM public.bookings WHERE id = p_booking_id;
  IF b.id IS NULL THEN RETURN NULL; END IF;
  SELECT * INTO ps FROM public.policy_settings WHERE tenant_id = b.tenant_id;

  SELECT COALESCE(SUM(line_total),0) INTO v_base
  FROM public.invoice_items WHERE booking_id = p_booking_id;

  v_hours := EXTRACT(EPOCH FROM (COALESCE(b.start_at, (b.start_date)::timestamptz) - p_at)) / 3600.0;

  IF b.service_type::text LIKE 'grooming%' THEN
    SELECT COALESCE(cancellation_fee_pct,0), COALESCE(cancellation_notice_hours,0)
      INTO v_gr_pct, v_gr_hours
    FROM public.grooming_workflow_settings WHERE tenant_id = b.tenant_id;
    v_window := COALESCE(NULLIF(v_gr_hours,0), ps.grooming_cancellation_hours, 24);
    v_pct := COALESCE(v_gr_pct, 0);
    v_basis := 'grooming_notice';
  ELSIF b.service_type::text LIKE 'hotel%' THEN
    v_window := COALESCE(ps.hotel_cancellation_cutoff_days, 14) * 24;
    v_pct := COALESCE(ps.hotel_deposit_percent, 0);
    v_basis := 'hotel_deposit_forfeit';
  ELSE
    v_window := 0;
    v_pct := 0;
  END IF;

  v_within := v_hours < v_window;

  RETURN jsonb_build_object(
    'booking_id', b.id,
    'basis', v_basis,
    'percent', v_pct,
    'base', v_base,
    'hours_notice', ROUND(v_hours, 1),
    'notice_window_hours', v_window,
    'within_notice_window', v_within,
    'applies', (v_within AND v_pct > 0 AND v_base > 0),
    'amount', CASE WHEN v_within AND v_pct > 0 THEN ROUND(v_base * v_pct / 100.0, 2) ELSE 0 END
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.booking_cancellation_quote(uuid, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.booking_cancellation_quote(uuid, timestamptz) TO authenticated, service_role;

-- Strip the cancelled booking's charges and leave only the fee (if any).
CREATE OR REPLACE FUNCTION public.apply_cancellation_fee(p_booking_id uuid, p_waive boolean DEFAULT false, p_reason text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  b public.bookings;
  q jsonb;
  v_fee numeric(12,2) := 0;
  v_inv uuid;
  v_locked boolean := false;
  v_status text;
  v_paid numeric;
  v_remaining int;
  v_note text;
BEGIN
  SELECT * INTO b FROM public.bookings WHERE id = p_booking_id;
  IF b.id IS NULL THEN RETURN NULL; END IF;

  q := public.booking_cancellation_quote(p_booking_id);
  v_fee := CASE WHEN p_waive THEN 0 ELSE COALESCE((q->>'amount')::numeric, 0) END;

  SELECT DISTINCT i.id, i.status::text, i.amount_paid INTO v_inv, v_status, v_paid
  FROM public.invoice_items ii
  JOIN public.invoices i ON i.id = ii.invoice_id
  WHERE ii.booking_id = p_booking_id
  LIMIT 1;

  IF v_inv IS NULL THEN
    v_inv := b.invoice_id;
    IF v_inv IS NOT NULL THEN
      SELECT status::text, amount_paid INTO v_status, v_paid FROM public.invoices WHERE id = v_inv;
    END IF;
  END IF;

  v_locked := v_inv IS NOT NULL
    AND (COALESCE(v_paid,0) > 0 OR v_status IN ('sent','part_paid','paid','overdue','cancelled'));

  IF v_locked THEN
    v_note := 'Invoice already sent or paid — handle with a credit note or refund.';
    UPDATE public.bookings
       SET cancellation_fee_zar = v_fee, cancellation_fee_note = v_note, updated_at = now()
     WHERE id = p_booking_id;
    RETURN jsonb_build_object('fee', v_fee, 'invoice_id', v_inv, 'invoice_locked', true, 'note', v_note, 'quote', q);
  END IF;

  IF v_inv IS NOT NULL THEN
    DELETE FROM public.invoice_items
     WHERE invoice_id = v_inv
       AND booking_id = p_booking_id
       AND COALESCE(source_type,'') <> 'cancellation_fee';
  END IF;

  IF v_fee > 0 THEN
    IF v_inv IS NULL THEN
      v_inv := public.ensure_booking_invoice(p_booking_id);
    END IF;
    DELETE FROM public.invoice_items
      WHERE source_type = 'cancellation_fee' AND source_id = p_booking_id;
    INSERT INTO public.invoice_items(
      tenant_id, invoice_id, booking_id, description, quantity, unit_price, line_total,
      sort_order, source_type, source_id
    ) VALUES (
      b.tenant_id, v_inv, p_booking_id,
      'Cancellation fee — booking ' || COALESCE(b.booking_number,'')
        || ' (' || (q->>'percent') || '% of ' || to_char(COALESCE((q->>'base')::numeric,0), 'FM999999990.00') || ')',
      1, v_fee, v_fee, 1, 'cancellation_fee', p_booking_id
    );
    v_note := 'Cancellation fee of R' || to_char(v_fee, 'FM999999990.00') || ' charged.';
  ELSE
    v_note := CASE WHEN p_waive THEN 'Cancellation fee waived.' ELSE 'Cancelled outside the notice window — no fee.' END;
  END IF;

  IF v_inv IS NOT NULL THEN
    SELECT count(*) INTO v_remaining FROM public.invoice_items WHERE invoice_id = v_inv;
    IF v_remaining = 0 THEN
      UPDATE public.invoices
         SET status = 'cancelled', subtotal = 0, total = 0, balance_due = 0, updated_at = now()
       WHERE id = v_inv;
    ELSE
      UPDATE public.invoices i SET
        subtotal = (SELECT COALESCE(SUM(line_total),0) FROM public.invoice_items WHERE invoice_id = i.id),
        total    = (SELECT COALESCE(SUM(line_total),0) FROM public.invoice_items WHERE invoice_id = i.id),
        balance_due = (SELECT COALESCE(SUM(line_total),0) FROM public.invoice_items WHERE invoice_id = i.id) - i.amount_paid,
        updated_at = now()
      WHERE i.id = v_inv;
    END IF;
  END IF;

  UPDATE public.bookings
     SET cancellation_fee_zar = v_fee,
         cancellation_fee_note = COALESCE(v_note,'') || CASE WHEN p_reason IS NOT NULL THEN ' ' || p_reason ELSE '' END,
         updated_at = now()
   WHERE id = p_booking_id;

  RETURN jsonb_build_object('fee', v_fee, 'invoice_id', v_inv, 'invoice_locked', false, 'note', v_note, 'quote', q);
END;
$function$;

REVOKE ALL ON FUNCTION public.apply_cancellation_fee(uuid, boolean, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.apply_cancellation_fee(uuid, boolean, text) TO authenticated, service_role;

-- Fire on cancellation, and count amendments on reschedule.
CREATE OR REPLACE FUNCTION public.bookings_fees_on_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_free int;
  v_fee numeric(12,2);
  v_inv uuid;
  v_status text;
  v_paid numeric;
  v_sort int;
BEGIN
  IF NEW.status = 'cancelled'::public.booking_status
     AND OLD.status IS DISTINCT FROM NEW.status THEN
    PERFORM public.apply_cancellation_fee(NEW.id, COALESCE(NEW.cancellation_fee_waived,false), NULL);
    RETURN NEW;
  END IF;

  IF NEW.start_at IS DISTINCT FROM OLD.start_at
     AND OLD.status::text NOT IN ('draft','cancelled')
     AND NEW.service_type::text LIKE 'hotel%' THEN
    UPDATE public.bookings SET amendment_count = COALESCE(amendment_count,0) + 1 WHERE id = NEW.id;

    SELECT COALESCE(hotel_free_amendments,0), COALESCE(hotel_amendment_fee,0)
      INTO v_free, v_fee
    FROM public.policy_settings WHERE tenant_id = NEW.tenant_id;

    IF COALESCE(v_fee,0) > 0 AND COALESCE(NEW.amendment_count,0) + 1 > COALESCE(v_free,0) THEN
      SELECT DISTINCT i.id, i.status::text, i.amount_paid INTO v_inv, v_status, v_paid
      FROM public.invoice_items ii JOIN public.invoices i ON i.id = ii.invoice_id
      WHERE ii.booking_id = NEW.id LIMIT 1;

      IF v_inv IS NOT NULL
         AND COALESCE(v_paid,0) = 0
         AND v_status NOT IN ('sent','part_paid','paid','overdue','cancelled') THEN
        SELECT COALESCE(MAX(sort_order),0)+1 INTO v_sort FROM public.invoice_items WHERE invoice_id = v_inv;
        INSERT INTO public.invoice_items(
          tenant_id, invoice_id, booking_id, description, quantity, unit_price, line_total,
          sort_order, source_type, source_id
        ) VALUES (
          NEW.tenant_id, v_inv, NEW.id,
          'Amendment fee — booking ' || COALESCE(NEW.booking_number,''),
          1, v_fee, v_fee, v_sort, 'amendment_fee', NEW.id
        );
        UPDATE public.invoices i SET
          subtotal = (SELECT COALESCE(SUM(line_total),0) FROM public.invoice_items WHERE invoice_id = i.id),
          total    = (SELECT COALESCE(SUM(line_total),0) FROM public.invoice_items WHERE invoice_id = i.id),
          balance_due = (SELECT COALESCE(SUM(line_total),0) FROM public.invoice_items WHERE invoice_id = i.id) - i.amount_paid,
          updated_at = now()
        WHERE i.id = v_inv;
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_bookings_fees_on_change ON public.bookings;
CREATE TRIGGER trg_bookings_fees_on_change
AFTER UPDATE ON public.bookings
FOR EACH ROW EXECUTE FUNCTION public.bookings_fees_on_change();