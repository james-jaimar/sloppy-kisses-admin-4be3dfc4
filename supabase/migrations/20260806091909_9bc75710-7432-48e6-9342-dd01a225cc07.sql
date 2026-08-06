
-- 1. Invoice columns for the single-invoice deposit model + pre-arrival reminders
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS deposit_due numeric(12,2),
  ADD COLUMN IF NOT EXISTS deposit_due_date date,
  ADD COLUMN IF NOT EXISTS last_prearrival_offset integer;

ALTER TABLE public.policy_settings
  ADD COLUMN IF NOT EXISTS hotel_prearrival_reminder_days integer[] NOT NULL DEFAULT '{3,2,1}';

-- 2. VAT inclusivity resolved from tenant settings when not explicitly set
ALTER TABLE public.invoice_items ALTER COLUMN vat_inclusive DROP DEFAULT;
ALTER TABLE public.invoice_items ALTER COLUMN vat_inclusive DROP NOT NULL;

CREATE OR REPLACE FUNCTION public.invoice_items_compute()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  v_gross NUMERIC(14,4);
  v_disc  NUMERIC(14,4);
  v_net   NUMERIC(14,4);
  v_rate  NUMERIC(5,2);
  v_incl  boolean;
BEGIN
  IF NEW.vat_rate IS NULL OR NEW.vat_inclusive IS NULL THEN
    SELECT COALESCE(default_vat_rate, 0), COALESCE(prices_include_vat, false)
      INTO v_rate, v_incl
      FROM public.invoicing_settings WHERE tenant_id = NEW.tenant_id;
    NEW.vat_rate := COALESCE(NEW.vat_rate, v_rate, 0);
    NEW.vat_inclusive := COALESCE(NEW.vat_inclusive, v_incl, false);
  END IF;

  v_gross := ROUND(COALESCE(NEW.quantity, 0) * COALESCE(NEW.unit_price, 0), 4);
  v_disc  := ROUND(v_gross * COALESCE(NEW.discount_pct, 0) / 100.0, 2);
  NEW.discount_amount := v_disc;

  IF NEW.vat_inclusive THEN
    v_net := ROUND((v_gross - v_disc) / (1 + NEW.vat_rate / 100.0), 2);
    NEW.line_total := v_net;
    NEW.vat_amount := ROUND((v_gross - v_disc) - v_net, 2);
  ELSE
    v_net := ROUND(v_gross - v_disc, 2);
    NEW.line_total := v_net;
    NEW.vat_amount := ROUND(v_net * NEW.vat_rate / 100.0, 2);
  END IF;

  RETURN NEW;
END $function$;

-- 3. Single invoice per hotel stay: record a deposit amount, no second invoice
CREATE OR REPLACE FUNCTION public.sync_hotel_deposit_invoice(p_booking_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_b public.bookings;
  v_enabled boolean;
  v_pct numeric(5,2);
  v_lead integer;
  v_total numeric(12,2);
  v_dep numeric(12,2);
  v_checkin date;
BEGIN
  SELECT * INTO v_b FROM public.bookings WHERE id = p_booking_id;
  IF v_b.id IS NULL OR v_b.invoice_id IS NULL THEN RETURN; END IF;
  IF v_b.service_type::text NOT IN ('hotel_dog','hotel_cat') THEN RETURN; END IF;
  IF public._invoice_locked(v_b.invoice_id) THEN RETURN; END IF;

  -- legacy offset lines from the old two-invoice model
  DELETE FROM public.invoice_items
   WHERE invoice_id = v_b.invoice_id AND source_type = 'hotel_deposit_offset';

  SELECT COALESCE(deposit_split_enabled, true) INTO v_enabled
    FROM public.hotel_workflow_settings WHERE tenant_id = v_b.tenant_id LIMIT 1;

  SELECT COALESCE(hotel_deposit_percent, 50), COALESCE(hotel_balance_due_days_before, 7)
    INTO v_pct, v_lead
    FROM public.policy_settings WHERE tenant_id = v_b.tenant_id LIMIT 1;
  v_pct  := COALESCE(v_pct, 50);
  v_lead := COALESCE(v_lead, 7);

  SELECT total INTO v_total FROM public.invoices WHERE id = v_b.invoice_id;
  v_checkin := COALESCE(v_b.start_date, v_b.start_at::date);

  IF COALESCE(v_enabled, true)
     AND NOT COALESCE(v_b.deposit_waived, false)
     AND v_pct > 0 AND v_pct < 100
     AND COALESCE(v_total,0) > 0 THEN
    v_dep := ROUND(v_total * v_pct / 100, 2);
  ELSE
    v_dep := NULL;
  END IF;

  UPDATE public.invoices
     SET invoice_kind = 'standard',
         deposit_due = v_dep,
         deposit_due_date = CASE WHEN v_dep IS NULL THEN NULL ELSE CURRENT_DATE END,
         due_date = GREATEST(CURRENT_DATE, COALESCE(v_checkin, CURRENT_DATE) - v_lead),
         booking_id = COALESCE(booking_id, v_b.id),
         updated_at = now()
   WHERE id = v_b.invoice_id;
END; $function$;

-- 4. "Pay in full" simply clears the deposit expectation on the single invoice
CREATE OR REPLACE FUNCTION public.hotel_pay_in_full(p_booking_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_b public.bookings;
BEGIN
  SELECT * INTO v_b FROM public.bookings WHERE id = p_booking_id;
  IF v_b.id IS NULL THEN RAISE EXCEPTION 'Booking not found'; END IF;

  IF NOT (
    EXISTS (SELECT 1 FROM public.tenant_users tu
             JOIN public.profiles pr ON pr.id = tu.profile_id
            WHERE tu.tenant_id = v_b.tenant_id AND pr.auth_user_id = auth.uid())
    OR public.current_customer_id() = v_b.customer_id
  ) THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;

  IF v_b.invoice_id IS NOT NULL THEN
    UPDATE public.invoices
       SET deposit_due = NULL, deposit_due_date = NULL, updated_at = now()
     WHERE id = v_b.invoice_id;
  END IF;

  RETURN v_b.invoice_id;
END; $function$;

-- 5. Never push zero-value invoices to Xero
CREATE OR REPLACE FUNCTION public.xero_queue_invoice()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.status IN ('issued','sent','part_paid','paid','overdue')
     AND COALESCE(NEW.total, 0) > 0 THEN
    PERFORM public.xero_enqueue(NEW.tenant_id, 'invoice', NEW.id);
  END IF;
  RETURN NEW;
END;
$function$;
