-- 1) New settings columns on grooming add-ons
ALTER TABLE public.grooming_addons
  ADD COLUMN IF NOT EXISTS duration_minutes integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS bookable_standalone boolean NOT NULL DEFAULT false;

UPDATE public.grooming_addons SET duration_minutes = 15, bookable_standalone = true WHERE code IN ('teeth_gel','nails_trim','nail_trim','ear_clean');
UPDATE public.grooming_addons SET duration_minutes = 20, bookable_standalone = true WHERE code IN ('teeth_toothpaste','anal_gland');
UPDATE public.grooming_addons SET duration_minutes = 30, bookable_standalone = true WHERE code = 'hand_strip';
UPDATE public.grooming_addons SET duration_minutes = 5 WHERE kind = 'shampoo_upgrade' AND duration_minutes = 0;

-- 2) Single source of truth for grooming add-on invoice lines
CREATE OR REPLACE FUNCTION public.grooming_sync_booking_addon_lines(p_booking_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_b public.bookings;
  v_pet_name text;
  v_sort integer;
  v_sel jsonb;
  v_group record;
  v_opt record;
  v_val jsonb;
  v_code text;
  v_codes text[] := ARRAY[]::text[];
  v_row record;
BEGIN
  SELECT * INTO v_b FROM public.bookings WHERE id = p_booking_id;
  IF v_b.id IS NULL OR v_b.invoice_id IS NULL THEN RETURN; END IF;
  IF public._invoice_locked(v_b.invoice_id) THEN RETURN; END IF;
  IF NOT COALESCE(public._auto_invoice_enabled(v_b.tenant_id, 'grooming'), true) THEN RETURN; END IF;

  SELECT p.name INTO v_pet_name
  FROM public.booking_pets bp JOIN public.pets p ON p.id = bp.pet_id
  WHERE bp.booking_id = v_b.id LIMIT 1;

  -- Instruction-derived add-on codes
  SELECT COALESCE(selections, '{}'::jsonb) INTO v_sel
  FROM public.grooming_booking_instructions WHERE booking_id = p_booking_id;
  v_sel := COALESCE(v_sel, '{}'::jsonb);

  FOR v_group IN
    SELECT id, code, kind FROM public.grooming_instruction_groups
    WHERE tenant_id = v_b.tenant_id AND active
  LOOP
    v_val := v_sel -> v_group.code;
    IF v_val IS NULL OR v_val = 'null'::jsonb THEN CONTINUE; END IF;

    IF v_group.kind = 'bool' THEN
      IF v_val::text = 'true' AND v_group.code = 'hand_strip' THEN
        v_codes := array_append(v_codes, 'hand_strip');
      END IF;
    ELSIF v_group.kind = 'single' THEN
      v_code := btrim(v_val::text, '"');
      SELECT * INTO v_opt FROM public.grooming_instruction_options
        WHERE group_id = v_group.id AND code = v_code AND active LIMIT 1;
      IF v_opt.addon_code IS NOT NULL THEN v_codes := array_append(v_codes, v_opt.addon_code); END IF;
    ELSIF v_group.kind = 'multi' THEN
      IF jsonb_typeof(v_val) = 'array' THEN
        FOR v_code IN SELECT jsonb_array_elements_text(v_val) LOOP
          SELECT * INTO v_opt FROM public.grooming_instruction_options
            WHERE group_id = v_group.id AND code = v_code AND active LIMIT 1;
          IF v_opt.addon_code IS NOT NULL THEN v_codes := array_append(v_codes, v_opt.addon_code); END IF;
        END LOOP;
      END IF;
    END IF;
  END LOOP;

  -- Desired lines: explicit booking add-ons win, instruction-derived fill the gaps
  CREATE TEMP TABLE _desired_addons ON COMMIT DROP AS
  SELECT DISTINCT ON (code) code, name, price, qty FROM (
    SELECT COALESCE(ga.addon_code, a.code) AS code,
           COALESCE(ga.addon_name, a.name) AS name,
           COALESCE(ga.price_zar_snapshot, a.price_zar, 0)::numeric AS price,
           GREATEST(COALESCE(ga.qty, 1), 1) AS qty,
           1 AS pref
      FROM public.grooming_booking_addons ga
      LEFT JOIN public.grooming_addons a ON a.id = ga.addon_id
     WHERE ga.booking_id = p_booking_id
    UNION ALL
    SELECT a.code, a.name, a.price_zar::numeric, 1, 2
      FROM public.grooming_addons a
     WHERE a.tenant_id = v_b.tenant_id AND a.active AND a.code = ANY(v_codes)
  ) s
  WHERE code IS NOT NULL
  ORDER BY code, pref;

  -- Remove managed lines that are no longer wanted
  DELETE FROM public.invoice_items i
   WHERE i.invoice_id = v_b.invoice_id
     AND i.booking_id = v_b.id
     AND i.item_code LIKE 'GROOM_ADDON:%'
     AND NOT EXISTS (
       SELECT 1 FROM _desired_addons d WHERE 'GROOM_ADDON:' || d.code = i.item_code
     );

  SELECT COALESCE(MAX(sort_order), 0) + 1 INTO v_sort
  FROM public.invoice_items WHERE invoice_id = v_b.invoice_id;

  FOR v_row IN SELECT * FROM _desired_addons LOOP
    -- Skip legacy lines added before item codes existed
    IF EXISTS (
      SELECT 1 FROM public.invoice_items i
       WHERE i.invoice_id = v_b.invoice_id AND i.booking_id = v_b.id
         AND i.item_code IS DISTINCT FROM ('GROOM_ADDON:' || v_row.code)
         AND (i.description = v_row.name
              OR i.description LIKE v_row.name || ' (%'
              OR i.description LIKE 'Add-on — ' || v_row.name || '%')
    ) THEN
      CONTINUE;
    END IF;

    IF EXISTS (
      SELECT 1 FROM public.invoice_items i
       WHERE i.invoice_id = v_b.invoice_id AND i.booking_id = v_b.id
         AND i.item_code = 'GROOM_ADDON:' || v_row.code
    ) THEN
      UPDATE public.invoice_items
         SET quantity = v_row.qty, unit_price = v_row.price,
             description = v_row.name || CASE WHEN v_pet_name IS NOT NULL THEN ' (' || v_pet_name || ')' ELSE '' END
       WHERE invoice_id = v_b.invoice_id AND booking_id = v_b.id
         AND item_code = 'GROOM_ADDON:' || v_row.code;
    ELSE
      INSERT INTO public.invoice_items(
        tenant_id, invoice_id, booking_id, description, quantity, unit_price, sort_order, item_code
      ) VALUES (
        v_b.tenant_id, v_b.invoice_id, v_b.id,
        v_row.name || CASE WHEN v_pet_name IS NOT NULL THEN ' (' || v_pet_name || ')' ELSE '' END,
        v_row.qty, v_row.price, v_sort, 'GROOM_ADDON:' || v_row.code
      );
      v_sort := v_sort + 1;
    END IF;
  END LOOP;

  DROP TABLE IF EXISTS _desired_addons;
END;
$function$;

REVOKE ALL ON FUNCTION public.grooming_sync_booking_addon_lines(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.grooming_sync_booking_addon_lines(uuid) TO authenticated, service_role;

-- 3) Route both legacy entry points at the new function
CREATE OR REPLACE FUNCTION public.grooming_sync_instruction_addons(p_booking_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM public.grooming_sync_booking_addon_lines(p_booking_id);
END;
$function$;

CREATE OR REPLACE FUNCTION public.grooming_addons_auto_invoice()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM public.grooming_sync_booking_addon_lines(COALESCE(NEW.booking_id, OLD.booking_id));
  RETURN COALESCE(NEW, OLD);
END;
$function$;

DROP TRIGGER IF EXISTS trg_grooming_addons_auto_invoice ON public.grooming_booking_addons;
CREATE TRIGGER trg_grooming_addons_auto_invoice
AFTER INSERT OR UPDATE OR DELETE ON public.grooming_booking_addons
FOR EACH ROW EXECUTE FUNCTION public.grooming_addons_auto_invoice();

-- 4) Backfill existing grooming bookings whose invoices are still editable
DO $do$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT b.id FROM public.bookings b
    JOIN public.invoices i ON i.id = b.invoice_id
    WHERE b.service_type IN ('grooming_inhouse','grooming_mobile')
      AND i.status::text NOT IN ('sent','part_paid','paid','overdue','cancelled')
  LOOP
    PERFORM public.grooming_sync_booking_addon_lines(r.id);
  END LOOP;
END
$do$;