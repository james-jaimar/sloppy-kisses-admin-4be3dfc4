ALTER TABLE public.hotel_workflow_settings
  ADD COLUMN IF NOT EXISTS long_stay_min_nights integer,
  ADD COLUMN IF NOT EXISTS long_stay_discount_pct numeric(5,2) NOT NULL DEFAULT 0;
ALTER TABLE public.hotel_booking_details
  ADD COLUMN IF NOT EXISTS discount_pct numeric(5,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS discount_reason text;

DO $mig$
DECLARE d text;
BEGIN
  d := pg_get_functiondef('public.hotel_details_auto_invoice'::regproc);
  d := replace(d, '  PERFORM public.sync_hotel_deposit_invoice(v_booking.id);',
$blk$  UPDATE public.invoice_items ii
     SET discount_pct = LEAST(100, COALESCE(NEW.discount_pct, 0) + COALESCE((
           SELECT CASE WHEN ws.long_stay_min_nights IS NOT NULL AND v_nights >= ws.long_stay_min_nights
                       THEN ws.long_stay_discount_pct ELSE 0 END
             FROM public.hotel_workflow_settings ws WHERE ws.tenant_id = NEW.tenant_id LIMIT 1), 0))
   WHERE ii.invoice_id = v_inv AND ii.booking_id = v_booking.id AND ii.source_type = 'hotel_stay';

  PERFORM public.sync_hotel_deposit_invoice(v_booking.id);$blk$);
  EXECUTE d;
END $mig$;