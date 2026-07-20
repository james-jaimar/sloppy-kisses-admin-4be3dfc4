
-- 1. Settings toggles
ALTER TABLE public.invoicing_settings
  ADD COLUMN IF NOT EXISTS auto_invoice_daycare  boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS auto_invoice_hotel    boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS auto_invoice_grooming boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS auto_invoice_transport boolean NOT NULL DEFAULT true;

-- 2. Enrolment -> invoice link
ALTER TABLE public.daycare_enrolments
  ADD COLUMN IF NOT EXISTS invoice_id uuid NULL REFERENCES public.invoices(id) ON DELETE SET NULL;

-- 3. Helper: reuse open draft or create a new one
CREATE OR REPLACE FUNCTION public.ensure_draft_invoice(p_tenant_id uuid, p_customer_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_num text;
BEGIN
  SELECT id INTO v_id
  FROM public.invoices
  WHERE tenant_id = p_tenant_id
    AND customer_id = p_customer_id
    AND status = 'draft'
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_id IS NOT NULL THEN
    RETURN v_id;
  END IF;

  v_num := public.next_invoice_number(p_tenant_id);
  INSERT INTO public.invoices(tenant_id, customer_id, invoice_number, status, notes)
  VALUES (p_tenant_id, p_customer_id, v_num, 'draft', 'Auto-created')
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_draft_invoice(uuid, uuid) FROM PUBLIC, anon, authenticated;

-- 4. Helper to check auto-invoice flag for a service
CREATE OR REPLACE FUNCTION public._auto_invoice_enabled(p_tenant_id uuid, p_service text)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE p_service
    WHEN 'daycare'   THEN COALESCE(s.auto_invoice_daycare, true)
    WHEN 'hotel'     THEN COALESCE(s.auto_invoice_hotel, true)
    WHEN 'grooming'  THEN COALESCE(s.auto_invoice_grooming, true)
    WHEN 'transport' THEN COALESCE(s.auto_invoice_transport, true)
    ELSE true END
  FROM public.invoicing_settings s WHERE s.tenant_id = p_tenant_id;
$$;

-- 5. Daycare enrolment trigger
CREATE OR REPLACE FUNCTION public.daycare_enrolments_auto_invoice()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inv uuid;
  v_plan public.daycare_plans;
  v_pet_name text;
  v_desc text;
  v_price numeric(12,2);
  v_next_sort integer;
BEGIN
  IF NEW.invoice_id IS NOT NULL THEN RETURN NEW; END IF;
  IF NOT COALESCE(public._auto_invoice_enabled(NEW.tenant_id, 'daycare'), true) THEN RETURN NEW; END IF;

  SELECT name INTO v_pet_name FROM public.pets WHERE id = NEW.pet_id;
  IF NEW.daycare_plan_id IS NOT NULL THEN
    SELECT * INTO v_plan FROM public.daycare_plans WHERE id = NEW.daycare_plan_id;
  END IF;
  v_price := COALESCE(v_plan.price, 0);
  v_desc := 'Daycare — ' || COALESCE(v_plan.name, 'Drop-in')
            || CASE WHEN v_pet_name IS NOT NULL THEN ' (' || v_pet_name || ')' ELSE '' END;

  v_inv := public.ensure_draft_invoice(NEW.tenant_id, NEW.customer_id);
  SELECT COALESCE(MAX(sort_order),0)+1 INTO v_next_sort FROM public.invoice_items WHERE invoice_id = v_inv;

  INSERT INTO public.invoice_items(tenant_id, invoice_id, description, quantity, unit_price, line_total, sort_order)
  VALUES (NEW.tenant_id, v_inv, v_desc, 1, v_price, ROUND(v_price, 2), v_next_sort);

  UPDATE public.daycare_enrolments SET invoice_id = v_inv WHERE id = NEW.id;

  -- Refresh invoice totals
  UPDATE public.invoices i SET
    subtotal = (SELECT COALESCE(SUM(line_total),0) FROM public.invoice_items WHERE invoice_id = i.id),
    total    = (SELECT COALESCE(SUM(line_total),0) FROM public.invoice_items WHERE invoice_id = i.id),
    balance_due = (SELECT COALESCE(SUM(line_total),0) FROM public.invoice_items WHERE invoice_id = i.id) - i.amount_paid,
    updated_at = now()
  WHERE i.id = v_inv;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_daycare_enrolments_auto_invoice ON public.daycare_enrolments;
CREATE TRIGGER trg_daycare_enrolments_auto_invoice
AFTER INSERT ON public.daycare_enrolments
FOR EACH ROW EXECUTE FUNCTION public.daycare_enrolments_auto_invoice();

-- 6. Grooming booking details trigger
CREATE OR REPLACE FUNCTION public.grooming_details_auto_invoice()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_booking public.bookings;
  v_pkg public.grooming_packages;
  v_pet_name text;
  v_inv uuid;
  v_sort integer;
  v_pkg_price numeric(12,2);
BEGIN
  SELECT * INTO v_booking FROM public.bookings WHERE id = NEW.booking_id;
  IF v_booking.id IS NULL OR v_booking.invoice_id IS NOT NULL THEN RETURN NEW; END IF;
  IF NOT COALESCE(public._auto_invoice_enabled(NEW.tenant_id, 'grooming'), true) THEN RETURN NEW; END IF;

  IF NEW.package_id IS NOT NULL THEN
    SELECT * INTO v_pkg FROM public.grooming_packages WHERE id = NEW.package_id;
  END IF;
  v_pkg_price := COALESCE(v_pkg.price_zar, 0);

  SELECT p.name INTO v_pet_name
  FROM public.booking_pets bp JOIN public.pets p ON p.id = bp.pet_id
  WHERE bp.booking_id = v_booking.id LIMIT 1;

  v_inv := public.ensure_draft_invoice(v_booking.tenant_id, v_booking.customer_id);
  UPDATE public.bookings SET invoice_id = v_inv WHERE id = v_booking.id;

  SELECT COALESCE(MAX(sort_order),0)+1 INTO v_sort FROM public.invoice_items WHERE invoice_id = v_inv;

  INSERT INTO public.invoice_items(tenant_id, invoice_id, booking_id, description, quantity, unit_price, line_total, sort_order)
  VALUES (v_booking.tenant_id, v_inv, v_booking.id,
    'Grooming — ' || COALESCE(v_pkg.name, COALESCE(NEW.service_package, 'Service'))
      || CASE WHEN v_pet_name IS NOT NULL THEN ' (' || v_pet_name || ')' ELSE '' END,
    1, v_pkg_price, ROUND(v_pkg_price,2), v_sort);
  v_sort := v_sort + 1;

  IF COALESCE(NEW.travel_fee,0) > 0 THEN
    INSERT INTO public.invoice_items(tenant_id, invoice_id, booking_id, description, quantity, unit_price, line_total, sort_order)
    VALUES (v_booking.tenant_id, v_inv, v_booking.id, 'Mobile travel fee', 1, NEW.travel_fee, ROUND(NEW.travel_fee,2), v_sort);
    v_sort := v_sort + 1;
  END IF;
  IF COALESCE(NEW.matted_surcharge_zar,0) > 0 THEN
    INSERT INTO public.invoice_items(tenant_id, invoice_id, booking_id, description, quantity, unit_price, line_total, sort_order)
    VALUES (v_booking.tenant_id, v_inv, v_booking.id, 'Matted coat surcharge', 1, NEW.matted_surcharge_zar, ROUND(NEW.matted_surcharge_zar,2), v_sort);
    v_sort := v_sort + 1;
  END IF;
  IF COALESCE(NEW.sedation_surcharge_zar,0) > 0 THEN
    INSERT INTO public.invoice_items(tenant_id, invoice_id, booking_id, description, quantity, unit_price, line_total, sort_order)
    VALUES (v_booking.tenant_id, v_inv, v_booking.id, 'Sedation surcharge', 1, NEW.sedation_surcharge_zar, ROUND(NEW.sedation_surcharge_zar,2), v_sort);
  END IF;

  UPDATE public.invoices i SET
    subtotal = (SELECT COALESCE(SUM(line_total),0) FROM public.invoice_items WHERE invoice_id = i.id),
    total    = (SELECT COALESCE(SUM(line_total),0) FROM public.invoice_items WHERE invoice_id = i.id),
    balance_due = (SELECT COALESCE(SUM(line_total),0) FROM public.invoice_items WHERE invoice_id = i.id) - i.amount_paid,
    updated_at = now()
  WHERE i.id = v_inv;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_grooming_details_auto_invoice ON public.grooming_booking_details;
CREATE TRIGGER trg_grooming_details_auto_invoice
AFTER INSERT ON public.grooming_booking_details
FOR EACH ROW EXECUTE FUNCTION public.grooming_details_auto_invoice();

-- 7. Grooming add-ons trigger (append to already-linked invoice)
CREATE OR REPLACE FUNCTION public.grooming_addons_auto_invoice()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_booking public.bookings;
  v_addon_name text;
  v_price numeric(12,2);
  v_sort integer;
BEGIN
  SELECT * INTO v_booking FROM public.bookings WHERE id = NEW.booking_id;
  IF v_booking.id IS NULL OR v_booking.invoice_id IS NULL THEN RETURN NEW; END IF;
  IF NOT COALESCE(public._auto_invoice_enabled(NEW.tenant_id, 'grooming'), true) THEN RETURN NEW; END IF;

  SELECT name, price_zar INTO v_addon_name, v_price
  FROM public.grooming_addons WHERE id = NEW.addon_id;
  v_price := COALESCE(NEW.price_zar_snapshot, v_price, 0);

  SELECT COALESCE(MAX(sort_order),0)+1 INTO v_sort FROM public.invoice_items WHERE invoice_id = v_booking.invoice_id;

  INSERT INTO public.invoice_items(tenant_id, invoice_id, booking_id, description, quantity, unit_price, line_total, sort_order)
  VALUES (v_booking.tenant_id, v_booking.invoice_id, v_booking.id,
    'Add-on — ' || COALESCE(v_addon_name, 'Grooming add-on'),
    COALESCE(NEW.quantity, 1), v_price, ROUND(COALESCE(NEW.quantity,1) * v_price, 2), v_sort);

  UPDATE public.invoices i SET
    subtotal = (SELECT COALESCE(SUM(line_total),0) FROM public.invoice_items WHERE invoice_id = i.id),
    total    = (SELECT COALESCE(SUM(line_total),0) FROM public.invoice_items WHERE invoice_id = i.id),
    balance_due = (SELECT COALESCE(SUM(line_total),0) FROM public.invoice_items WHERE invoice_id = i.id) - i.amount_paid,
    updated_at = now()
  WHERE i.id = v_booking.invoice_id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_grooming_addons_auto_invoice ON public.grooming_booking_addons;
CREATE TRIGGER trg_grooming_addons_auto_invoice
AFTER INSERT ON public.grooming_booking_addons
FOR EACH ROW EXECUTE FUNCTION public.grooming_addons_auto_invoice();

-- 8. Hotel booking details trigger (placeholder line)
CREATE OR REPLACE FUNCTION public.hotel_details_auto_invoice()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_booking public.bookings;
  v_pet_name text;
  v_nights integer;
  v_inv uuid;
  v_sort integer;
BEGIN
  SELECT * INTO v_booking FROM public.bookings WHERE id = NEW.booking_id;
  IF v_booking.id IS NULL OR v_booking.invoice_id IS NOT NULL THEN RETURN NEW; END IF;
  IF NOT COALESCE(public._auto_invoice_enabled(NEW.tenant_id, 'hotel'), true) THEN RETURN NEW; END IF;

  v_nights := GREATEST(1, COALESCE(
    (v_booking.end_date - v_booking.start_date),
    (EXTRACT(EPOCH FROM (v_booking.end_at - v_booking.start_at))/86400)::int,
    1));

  SELECT p.name INTO v_pet_name
  FROM public.booking_pets bp JOIN public.pets p ON p.id = bp.pet_id
  WHERE bp.booking_id = v_booking.id LIMIT 1;

  v_inv := public.ensure_draft_invoice(v_booking.tenant_id, v_booking.customer_id);
  UPDATE public.bookings SET invoice_id = v_inv WHERE id = v_booking.id;

  SELECT COALESCE(MAX(sort_order),0)+1 INTO v_sort FROM public.invoice_items WHERE invoice_id = v_inv;

  INSERT INTO public.invoice_items(tenant_id, invoice_id, booking_id, description, quantity, unit_price, line_total, sort_order)
  VALUES (v_booking.tenant_id, v_inv, v_booking.id,
    'Hotel stay — ' || COALESCE(NEW.accommodation_type, 'boarding')
      || CASE WHEN v_pet_name IS NOT NULL THEN ' (' || v_pet_name || ')' ELSE '' END,
    v_nights, 0, 0, v_sort);

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_hotel_details_auto_invoice ON public.hotel_booking_details;
CREATE TRIGGER trg_hotel_details_auto_invoice
AFTER INSERT ON public.hotel_booking_details
FOR EACH ROW EXECUTE FUNCTION public.hotel_details_auto_invoice();

-- 9. Transport details trigger (placeholder line)
CREATE OR REPLACE FUNCTION public.transport_details_auto_invoice()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_booking public.bookings;
  v_inv uuid;
  v_sort integer;
BEGIN
  SELECT * INTO v_booking FROM public.bookings WHERE id = NEW.booking_id;
  IF v_booking.id IS NULL OR v_booking.invoice_id IS NOT NULL THEN RETURN NEW; END IF;
  IF NOT COALESCE(public._auto_invoice_enabled(NEW.tenant_id, 'transport'), true) THEN RETURN NEW; END IF;

  v_inv := public.ensure_draft_invoice(v_booking.tenant_id, v_booking.customer_id);
  UPDATE public.bookings SET invoice_id = v_inv WHERE id = v_booking.id;

  SELECT COALESCE(MAX(sort_order),0)+1 INTO v_sort FROM public.invoice_items WHERE invoice_id = v_inv;

  INSERT INTO public.invoice_items(tenant_id, invoice_id, booking_id, description, quantity, unit_price, line_total, sort_order)
  VALUES (v_booking.tenant_id, v_inv, v_booking.id,
    'Transport — ' || COALESCE(NEW.direction, 'trip'),
    1, 0, 0, v_sort);

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_transport_details_auto_invoice ON public.transport_details;
CREATE TRIGGER trg_transport_details_auto_invoice
AFTER INSERT ON public.transport_details
FOR EACH ROW EXECUTE FUNCTION public.transport_details_auto_invoice();
