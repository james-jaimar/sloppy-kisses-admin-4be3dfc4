
-- Rewrite grooming auto-invoice to also insert add-on lines mapped from instruction selections.
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
  v_disc_pct numeric(5,2);
BEGIN
  SELECT * INTO v_booking FROM public.bookings WHERE id = NEW.booking_id;
  IF v_booking.id IS NULL OR v_booking.invoice_id IS NOT NULL THEN RETURN NEW; END IF;
  IF NOT COALESCE(public._auto_invoice_enabled(NEW.tenant_id, 'grooming'), true) THEN RETURN NEW; END IF;

  IF NEW.package_id IS NOT NULL THEN
    SELECT * INTO v_pkg FROM public.grooming_packages WHERE id = NEW.package_id;
  END IF;
  v_pkg_price := COALESCE(v_pkg.price_zar, 0);

  SELECT COALESCE(pensioner_discount_pct, 0) INTO v_disc_pct
  FROM public.grooming_workflow_settings WHERE tenant_id = NEW.tenant_id LIMIT 1;
  v_disc_pct := COALESCE(v_disc_pct, 0);

  SELECT p.name INTO v_pet_name
  FROM public.booking_pets bp JOIN public.pets p ON p.id = bp.pet_id
  WHERE bp.booking_id = v_booking.id LIMIT 1;

  v_inv := public.ensure_draft_invoice(v_booking.tenant_id, v_booking.customer_id);
  UPDATE public.bookings SET invoice_id = v_inv WHERE id = v_booking.id;

  SELECT COALESCE(MAX(sort_order),0)+1 INTO v_sort FROM public.invoice_items WHERE invoice_id = v_inv;

  INSERT INTO public.invoice_items(
    tenant_id, invoice_id, booking_id, description, quantity, unit_price, sort_order, discount_pct
  ) VALUES (
    v_booking.tenant_id, v_inv, v_booking.id,
    'Grooming — ' || COALESCE(v_pkg.name, COALESCE(NEW.service_package, 'Service'))
      || CASE WHEN v_pet_name IS NOT NULL THEN ' (' || v_pet_name || ')' ELSE '' END,
    1, v_pkg_price, v_sort,
    CASE WHEN COALESCE(NEW.pensioner_discount, false) THEN v_disc_pct ELSE 0 END
  );
  v_sort := v_sort + 1;

  IF COALESCE(NEW.travel_fee,0) > 0 THEN
    INSERT INTO public.invoice_items(tenant_id, invoice_id, booking_id, description, quantity, unit_price, sort_order)
    VALUES (v_booking.tenant_id, v_inv, v_booking.id, 'Mobile travel fee', 1, NEW.travel_fee, v_sort);
    v_sort := v_sort + 1;
  END IF;
  IF COALESCE(NEW.matted_surcharge_zar,0) > 0 THEN
    INSERT INTO public.invoice_items(tenant_id, invoice_id, booking_id, description, quantity, unit_price, sort_order)
    VALUES (v_booking.tenant_id, v_inv, v_booking.id, 'Matted coat surcharge', 1, NEW.matted_surcharge_zar, v_sort);
    v_sort := v_sort + 1;
  END IF;
  IF COALESCE(NEW.sedation_surcharge_zar,0) > 0 THEN
    INSERT INTO public.invoice_items(tenant_id, invoice_id, booking_id, description, quantity, unit_price, sort_order)
    VALUES (v_booking.tenant_id, v_inv, v_booking.id, 'Sedation surcharge', 1, NEW.sedation_surcharge_zar, v_sort);
  END IF;

  -- Sync instruction-driven add-ons if any instructions exist for this booking.
  PERFORM public.grooming_sync_instruction_addons(v_booking.id);

  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.grooming_details_auto_invoice() FROM PUBLIC, anon, authenticated;

-- New helper: reconcile invoice_items with instruction-selected add-ons for a booking.
-- Idempotent — only adds missing lines; never duplicates. Only touches draft invoices.
CREATE OR REPLACE FUNCTION public.grooming_sync_instruction_addons(p_booking_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_booking public.bookings;
  v_inv public.invoices;
  v_pet_name text;
  v_sort integer;
  v_instr public.grooming_booking_instructions;
  v_sel jsonb;
  v_group record;
  v_opt record;
  v_addon record;
  v_val jsonb;
  v_code text;
  v_addon_codes text[] := ARRAY[]::text[];
BEGIN
  SELECT * INTO v_booking FROM public.bookings WHERE id = p_booking_id;
  IF v_booking.id IS NULL OR v_booking.invoice_id IS NULL THEN RETURN; END IF;
  SELECT * INTO v_inv FROM public.invoices WHERE id = v_booking.invoice_id;
  IF v_inv.id IS NULL OR v_inv.status <> 'draft' THEN RETURN; END IF;
  SELECT * INTO v_instr FROM public.grooming_booking_instructions WHERE booking_id = p_booking_id;
  IF v_instr.booking_id IS NULL THEN RETURN; END IF;
  v_sel := COALESCE(v_instr.selections, '{}'::jsonb);

  SELECT p.name INTO v_pet_name
  FROM public.booking_pets bp JOIN public.pets p ON p.id = bp.pet_id
  WHERE bp.booking_id = v_booking.id LIMIT 1;

  -- Collect addon codes triggered by selections
  FOR v_group IN
    SELECT id, code, kind FROM public.grooming_instruction_groups
    WHERE tenant_id = v_booking.tenant_id AND active
  LOOP
    v_val := v_sel -> v_group.code;
    IF v_val IS NULL OR v_val = 'null'::jsonb THEN CONTINUE; END IF;

    IF v_group.kind = 'bool' THEN
      IF v_val::text = 'true' AND v_group.code = 'hand_strip' THEN
        v_addon_codes := array_append(v_addon_codes, 'hand_strip');
      END IF;
    ELSIF v_group.kind = 'single' THEN
      v_code := btrim(v_val::text, '"');
      SELECT * INTO v_opt FROM public.grooming_instruction_options
        WHERE group_id = v_group.id AND code = v_code AND active LIMIT 1;
      IF v_opt.addon_code IS NOT NULL THEN
        v_addon_codes := array_append(v_addon_codes, v_opt.addon_code);
      END IF;
    ELSIF v_group.kind = 'multi' THEN
      IF jsonb_typeof(v_val) = 'array' THEN
        FOR v_code IN SELECT jsonb_array_elements_text(v_val) LOOP
          SELECT * INTO v_opt FROM public.grooming_instruction_options
            WHERE group_id = v_group.id AND code = v_code AND active LIMIT 1;
          IF v_opt.addon_code IS NOT NULL THEN
            v_addon_codes := array_append(v_addon_codes, v_opt.addon_code);
          END IF;
        END LOOP;
      END IF;
    END IF;
  END LOOP;

  -- Dedupe
  SELECT ARRAY(SELECT DISTINCT unnest(v_addon_codes)) INTO v_addon_codes;
  IF array_length(v_addon_codes, 1) IS NULL THEN RETURN; END IF;

  SELECT COALESCE(MAX(sort_order),0)+1 INTO v_sort FROM public.invoice_items WHERE invoice_id = v_inv.id;

  FOR v_addon IN
    SELECT * FROM public.grooming_addons
    WHERE tenant_id = v_booking.tenant_id AND active AND code = ANY(v_addon_codes)
  LOOP
    -- Skip if this add-on already has a line on this booking's portion of the invoice
    IF EXISTS (
      SELECT 1 FROM public.invoice_items
      WHERE invoice_id = v_inv.id
        AND booking_id = v_booking.id
        AND description LIKE (v_addon.name || '%')
    ) THEN
      CONTINUE;
    END IF;

    INSERT INTO public.invoice_items(
      tenant_id, invoice_id, booking_id, description, quantity, unit_price, sort_order
    ) VALUES (
      v_booking.tenant_id, v_inv.id, v_booking.id,
      v_addon.name || CASE WHEN v_pet_name IS NOT NULL THEN ' (' || v_pet_name || ')' ELSE '' END,
      1, v_addon.price_zar, v_sort
    );
    v_sort := v_sort + 1;
  END LOOP;
END;
$$;
REVOKE ALL ON FUNCTION public.grooming_sync_instruction_addons(uuid) FROM PUBLIC, anon, authenticated;

-- Trigger: whenever instructions are inserted/updated, sync add-ons onto the draft invoice.
CREATE OR REPLACE FUNCTION public.grooming_booking_instructions_sync()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.grooming_sync_instruction_addons(NEW.booking_id);
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.grooming_booking_instructions_sync() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_gbi_sync_invoice ON public.grooming_booking_instructions;
CREATE TRIGGER trg_gbi_sync_invoice
AFTER INSERT OR UPDATE ON public.grooming_booking_instructions
FOR EACH ROW EXECUTE FUNCTION public.grooming_booking_instructions_sync();
