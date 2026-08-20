DO $$
DECLARE
  r record;
  v_gated boolean;
  v_hours integer;
BEGIN
  FOR r IN
    SELECT b.id, b.tenant_id, b.service_type::text AS svc, b.status
      FROM public.bookings b
      JOIN public.invoices i ON i.id = b.invoice_id
     WHERE b.status = 'confirmed'::public.booking_status
       AND COALESCE(i.total, 0) > 0
       AND COALESCE(i.balance_due, 0) > 0
       AND i.status::text NOT IN ('cancelled', 'void')
       AND COALESCE(b.start_at, (b.start_date)::timestamptz) > now()
  LOOP
    SELECT g.gated, g.hold_hours INTO v_gated, v_hours
      FROM public.booking_payment_gate(r.tenant_id, r.svc) g;

    IF NOT COALESCE(v_gated, false) THEN CONTINUE; END IF;
    IF public.booking_payment_satisfied(r.id) THEN CONTINUE; END IF;

    UPDATE public.bookings
       SET status = 'pending_payment'::public.booking_status,
           payment_hold_expires_at = now() + make_interval(hours => COALESCE(v_hours, 48))
     WHERE id = r.id;

    INSERT INTO public.booking_status_events (tenant_id, booking_id, from_status, to_status, event_kind, note)
    VALUES (r.tenant_id, r.id, r.status, 'pending_payment'::public.booking_status, 'status_change',
            'Backfill: unpaid at payment-gate rollout');
  END LOOP;
END $$;