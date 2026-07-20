
-- 1) invoice_items source tagging
ALTER TABLE public.invoice_items
  ADD COLUMN IF NOT EXISTS source_type text,
  ADD COLUMN IF NOT EXISTS source_id uuid;

CREATE INDEX IF NOT EXISTS invoice_items_source_idx
  ON public.invoice_items(source_type, source_id);

-- 2) Update daycare auto-invoice trigger to stamp source
CREATE OR REPLACE FUNCTION public.daycare_enrolments_auto_invoice()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
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

  INSERT INTO public.invoice_items(tenant_id, invoice_id, description, quantity, unit_price, line_total, sort_order, source_type, source_id)
  VALUES (NEW.tenant_id, v_inv, v_desc, 1, v_price, ROUND(v_price, 2), v_next_sort, 'daycare_enrolment', NEW.id);

  UPDATE public.daycare_enrolments SET invoice_id = v_inv WHERE id = NEW.id;

  UPDATE public.invoices i SET
    subtotal = (SELECT COALESCE(SUM(line_total),0) FROM public.invoice_items WHERE invoice_id = i.id),
    total    = (SELECT COALESCE(SUM(line_total),0) FROM public.invoice_items WHERE invoice_id = i.id),
    balance_due = (SELECT COALESCE(SUM(line_total),0) FROM public.invoice_items WHERE invoice_id = i.id) - i.amount_paid,
    updated_at = now()
  WHERE i.id = v_inv;

  RETURN NEW;
END;
$$;

-- 3) Helper: strip auto-created invoice lines for a (source_type, source_id) and clean up the draft invoice
CREATE OR REPLACE FUNCTION public._strip_auto_invoice_lines(p_source_type text, p_source_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_inv record;
BEGIN
  FOR v_inv IN
    SELECT DISTINCT i.id, i.tenant_id, i.status
    FROM public.invoice_items ii
    JOIN public.invoices i ON i.id = ii.invoice_id
    WHERE ii.source_type = p_source_type AND ii.source_id = p_source_id
  LOOP
    IF v_inv.status <> 'draft' THEN
      RAISE EXCEPTION 'Cannot delete: linked invoice % is already %', v_inv.id, v_inv.status
        USING ERRCODE = 'P0001';
    END IF;
    DELETE FROM public.invoice_items
      WHERE invoice_id = v_inv.id
        AND source_type = p_source_type
        AND source_id = p_source_id;

    IF NOT EXISTS (SELECT 1 FROM public.invoice_items WHERE invoice_id = v_inv.id) THEN
      DELETE FROM public.invoices WHERE id = v_inv.id;
    ELSE
      UPDATE public.invoices SET
        subtotal    = (SELECT COALESCE(SUM(line_total),0) FROM public.invoice_items WHERE invoice_id = v_inv.id),
        total       = (SELECT COALESCE(SUM(line_total),0) FROM public.invoice_items WHERE invoice_id = v_inv.id),
        balance_due = (SELECT COALESCE(SUM(line_total),0) FROM public.invoice_items WHERE invoice_id = v_inv.id) - amount_paid,
        updated_at  = now()
      WHERE id = v_inv.id;
    END IF;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public._strip_auto_invoice_lines(text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public._strip_auto_invoice_lines(text, uuid) TO service_role;

-- 4) Permissions
INSERT INTO public.permissions(code, label) VALUES
  ('daycare.enrolments.delete', 'Delete daycare enrolments'),
  ('daycare.plans.delete',      'Delete daycare plans'),
  ('bookings.delete',           'Delete bookings'),
  ('customers.delete',          'Delete customers'),
  ('pets.delete',               'Delete pets'),
  ('grooming.catalog.delete',   'Delete grooming packages / add-ons')
ON CONFLICT (code) DO NOTHING;

-- 5) Delete RPCs

-- daycare enrolment
CREATE OR REPLACE FUNCTION public.delete_daycare_enrolment(p_enrolment_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_tenant uuid;
BEGIN
  SELECT tenant_id INTO v_tenant FROM public.daycare_enrolments WHERE id = p_enrolment_id;
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'Enrolment not found'; END IF;
  IF NOT public.user_has_permission(v_tenant, 'daycare.enrolments.delete') AND NOT public.is_platform_owner() THEN
    RAISE EXCEPTION 'Missing permission daycare.enrolments.delete';
  END IF;

  PERFORM public._strip_auto_invoice_lines('daycare_enrolment', p_enrolment_id);
  DELETE FROM public.daycare_enrolments WHERE id = p_enrolment_id;
END;
$$;
REVOKE ALL ON FUNCTION public.delete_daycare_enrolment(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_daycare_enrolment(uuid) TO authenticated, service_role;

-- booking
CREATE OR REPLACE FUNCTION public.delete_booking(p_booking_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_tenant uuid;
BEGIN
  SELECT tenant_id INTO v_tenant FROM public.bookings WHERE id = p_booking_id;
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'Booking not found'; END IF;
  IF NOT public.user_has_permission(v_tenant, 'bookings.delete') AND NOT public.is_platform_owner() THEN
    RAISE EXCEPTION 'Missing permission bookings.delete';
  END IF;

  PERFORM public._strip_auto_invoice_lines('hotel_booking', p_booking_id);
  PERFORM public._strip_auto_invoice_lines('grooming_booking', p_booking_id);
  PERFORM public._strip_auto_invoice_lines('transport_booking', p_booking_id);

  -- Detail rows are typically ON DELETE CASCADE; delete parent last.
  DELETE FROM public.hotel_booking_details WHERE booking_id = p_booking_id;
  DELETE FROM public.grooming_booking_addons WHERE booking_id = p_booking_id;
  DELETE FROM public.grooming_booking_details WHERE booking_id = p_booking_id;
  DELETE FROM public.transport_details WHERE booking_id = p_booking_id;
  DELETE FROM public.booking_pets WHERE booking_id = p_booking_id;
  DELETE FROM public.booking_status_events WHERE booking_id = p_booking_id;
  DELETE FROM public.bookings WHERE id = p_booking_id;
END;
$$;
REVOKE ALL ON FUNCTION public.delete_booking(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_booking(uuid) TO authenticated, service_role;

-- pet
CREATE OR REPLACE FUNCTION public.delete_pet(p_pet_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_tenant uuid;
BEGIN
  SELECT tenant_id INTO v_tenant FROM public.pets WHERE id = p_pet_id;
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'Pet not found'; END IF;
  IF NOT public.user_has_permission(v_tenant, 'pets.delete') AND NOT public.is_platform_owner() THEN
    RAISE EXCEPTION 'Missing permission pets.delete';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.invoice_items ii
    JOIN public.invoices i ON i.id = ii.invoice_id
    JOIN public.daycare_enrolments e ON e.id = ii.source_id AND ii.source_type = 'daycare_enrolment'
    WHERE e.pet_id = p_pet_id AND i.status <> 'draft'
  ) THEN
    RAISE EXCEPTION 'Cannot delete: pet has enrolments linked to finalised invoices';
  END IF;

  -- Cleanup auto-invoice lines from this pet's enrolments/bookings
  PERFORM public._strip_auto_invoice_lines('daycare_enrolment', e.id)
    FROM public.daycare_enrolments e WHERE e.pet_id = p_pet_id;

  DELETE FROM public.daycare_attendance WHERE pet_id = p_pet_id;
  DELETE FROM public.daycare_day_swaps WHERE pet_id = p_pet_id;
  DELETE FROM public.daycare_enrolments WHERE pet_id = p_pet_id;
  DELETE FROM public.vaccinations WHERE pet_id = p_pet_id;
  DELETE FROM public.booking_pets WHERE pet_id = p_pet_id;
  DELETE FROM public.pets WHERE id = p_pet_id;
END;
$$;
REVOKE ALL ON FUNCTION public.delete_pet(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_pet(uuid) TO authenticated, service_role;

-- customer
CREATE OR REPLACE FUNCTION public.delete_customer(p_customer_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_tenant uuid;
  v_pet uuid;
BEGIN
  SELECT tenant_id INTO v_tenant FROM public.customers WHERE id = p_customer_id;
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'Customer not found'; END IF;
  IF NOT public.user_has_permission(v_tenant, 'customers.delete') AND NOT public.is_platform_owner() THEN
    RAISE EXCEPTION 'Missing permission customers.delete';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.invoices
    WHERE customer_id = p_customer_id AND status <> 'draft'
  ) THEN
    RAISE EXCEPTION 'Cannot delete: customer has finalised invoices. Archive instead.';
  END IF;

  -- Cascade-delete pets via delete_pet so invoice cleanup runs
  FOR v_pet IN SELECT id FROM public.pets WHERE customer_id = p_customer_id LOOP
    -- Inline pet cleanup (skip permission check; we've already checked customers.delete)
    PERFORM public._strip_auto_invoice_lines('daycare_enrolment', e.id)
      FROM public.daycare_enrolments e WHERE e.pet_id = v_pet;
    DELETE FROM public.daycare_attendance WHERE pet_id = v_pet;
    DELETE FROM public.daycare_day_swaps WHERE pet_id = v_pet;
    DELETE FROM public.daycare_enrolments WHERE pet_id = v_pet;
    DELETE FROM public.vaccinations WHERE pet_id = v_pet;
    DELETE FROM public.booking_pets WHERE pet_id = v_pet;
    DELETE FROM public.pets WHERE id = v_pet;
  END LOOP;

  -- Delete customer's draft invoices (strip lines first)
  DELETE FROM public.invoice_items WHERE invoice_id IN (
    SELECT id FROM public.invoices WHERE customer_id = p_customer_id AND status = 'draft'
  );
  DELETE FROM public.invoices WHERE customer_id = p_customer_id AND status = 'draft';

  DELETE FROM public.booking_requests WHERE customer_id = p_customer_id;
  DELETE FROM public.emergency_contacts WHERE customer_id = p_customer_id;
  DELETE FROM public.customers WHERE id = p_customer_id;
END;
$$;
REVOKE ALL ON FUNCTION public.delete_customer(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_customer(uuid) TO authenticated, service_role;
