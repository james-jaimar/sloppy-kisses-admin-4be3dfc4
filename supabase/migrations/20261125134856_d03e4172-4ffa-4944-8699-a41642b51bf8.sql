ALTER TABLE public.estimate_items ADD COLUMN IF NOT EXISTS source_type text, ADD COLUMN IF NOT EXISTS source_id uuid;
ALTER TABLE public.hotel_grooming_requests ADD COLUMN IF NOT EXISTS billed_invoice_id uuid REFERENCES public.invoices(id) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION public.hotel_quote_sync_grooms(p_estimate_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE e public.estimates; ws public.hotel_workflow_settings; v_pct numeric; v_total numeric; v_sort int;
BEGIN
  SELECT * INTO e FROM public.estimates WHERE id=p_estimate_id;
  IF e.id IS NULL OR e.booking_id IS NULL THEN RETURN; END IF;
  SELECT * INTO ws FROM public.hotel_workflow_settings WHERE tenant_id=e.tenant_id;
  v_pct := LEAST(100,GREATEST(0,COALESCE(ws.checkout_groom_discount_pct,0)));
  DELETE FROM public.estimate_items WHERE estimate_id=e.id AND source_type='hotel_groom';
  SELECT COALESCE(MAX(sort_order),0) INTO v_sort FROM public.estimate_items WHERE estimate_id=e.id;
  INSERT INTO public.estimate_items(tenant_id,estimate_id,booking_id,description,quantity,unit_price,line_total,sort_order,source_type,source_id)
  SELECT e.tenant_id,e.id,e.booking_id,
    COALESCE(gr.pet_name,'Pet')||' — departure groom: '||gp.name||CASE WHEN v_pct>0 THEN ' ('||trim(to_char(v_pct,'FM990.##'))||'% stay discount)' ELSE '' END,
    1, ROUND(gp.price_zar*(1-v_pct/100),2), ROUND(gp.price_zar*(1-v_pct/100),2),
    v_sort + row_number() OVER (ORDER BY gr.created_at, gr.id)::int * 10, 'hotel_groom', gr.id
  FROM public.hotel_grooming_requests gr JOIN public.grooming_packages gp ON gp.id=gr.package_id AND gp.tenant_id=e.tenant_id
  WHERE gr.hotel_booking_id=e.booking_id AND gr.status IN ('pending','scheduled')
    AND NOT EXISTS (SELECT 1 FROM public.bookings gb WHERE gb.id=gr.grooming_booking_id AND gb.invoice_id IS NOT NULL);
  INSERT INTO public.estimate_items(tenant_id,estimate_id,booking_id,description,quantity,unit_price,line_total,sort_order,source_type,source_id)
  SELECT e.tenant_id,e.id,e.booking_id,COALESCE(gr.pet_name,'Pet')||' — groom extra: '||ga.name,1,
    CASE WHEN gp.package_type='full' AND ga.code IN ('teeth_gel','nails_trim','nail_trim','ear_clean','anal_gland','hygiene_cut','hand_strip','shampoo_hypo','shampoo_tick_flea','shampoo_deshed','shampoo_whitening') THEN 0 ELSE ga.price_zar END,
    CASE WHEN gp.package_type='full' AND ga.code IN ('teeth_gel','nails_trim','nail_trim','ear_clean','anal_gland','hygiene_cut','hand_strip','shampoo_hypo','shampoo_tick_flea','shampoo_deshed','shampoo_whitening') THEN 0 ELSE ga.price_zar END,
    v_sort + 5000, 'hotel_groom', gr.id
  FROM public.hotel_grooming_requests gr
  JOIN public.grooming_addons ga ON ga.id=ANY(gr.addon_ids) AND ga.tenant_id=e.tenant_id
  LEFT JOIN public.grooming_packages gp ON gp.id=gr.package_id
  WHERE gr.hotel_booking_id=e.booking_id AND gr.status IN ('pending','scheduled')
    AND NOT EXISTS (SELECT 1 FROM public.bookings gb WHERE gb.id=gr.grooming_booking_id AND gb.invoice_id IS NOT NULL);
  SELECT COALESCE(SUM(line_total),0) INTO v_total FROM public.estimate_items WHERE estimate_id=e.id;
  UPDATE public.estimates SET subtotal=v_total,total=v_total,
    extras=CASE WHEN extras ? 'payment_percent' THEN extras||jsonb_build_object('payment_due',ROUND(v_total*COALESCE((extras->>'payment_percent')::numeric,100)/100,2)) ELSE extras END
  WHERE id=e.id AND (total IS DISTINCT FROM v_total OR subtotal IS DISTINCT FROM v_total);
END $$;
REVOKE ALL ON FUNCTION public.hotel_quote_sync_grooms(uuid) FROM PUBLIC, anon, authenticated;

-- Route the review action's groom lines through the shared sync.
DO $do$
DECLARE d text; s1 int; s2 int; a text := 'WHERE bs.booking_id=b.id;'; z text := 'SELECT COALESCE(SUM(line_total),0) INTO total FROM public.estimate_items WHERE estimate_id=e;';
BEGIN
  d := pg_get_functiondef('hotel_private.hotel_review_action(uuid,text,jsonb)'::regprocedure);
  s1 := strpos(d,a); s2 := strpos(d,z);
  IF s1=0 OR s2=0 OR s2<s1 OR strpos(substr(d,s1,s2-s1),'departure groom')=0 THEN RAISE EXCEPTION 'review action layout changed'; END IF;
  d := substr(d,1,s1+length(a)-1) || E'\n   PERFORM public.hotel_quote_sync_grooms(e);\n   ' || substr(d,s2);
  EXECUTE d;
END $do$;

-- Auto-update open quotes when grooms change; protect grooms already on an invoice.
CREATE OR REPLACE FUNCTION public.hotel_groom_requests_quote_sync()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_booking uuid := COALESCE(NEW.hotel_booking_id, OLD.hotel_booking_id); v_est uuid;
BEGIN
  IF TG_OP='UPDATE' AND OLD.billed_invoice_id IS NOT NULL AND NEW.billed_invoice_id IS NOT DISTINCT FROM OLD.billed_invoice_id
     AND (NEW.package_id IS DISTINCT FROM OLD.package_id OR NEW.addon_ids IS DISTINCT FROM OLD.addon_ids)
     AND EXISTS (SELECT 1 FROM public.invoices i WHERE i.id=OLD.billed_invoice_id AND i.status::text<>'cancelled') THEN
    RAISE EXCEPTION 'This groom is already on the hotel invoice. Use Adjust & re-bill on the invoice to change it.';
  END IF;
  SELECT r.estimate_id INTO v_est FROM public.hotel_booking_reviews r
    JOIN public.estimates e ON e.id=r.estimate_id
   WHERE r.booking_id=v_booking AND r.confirmed_at IS NULL AND r.verified_payment_id IS NULL
     AND e.status::text IN ('draft','sent') AND e.converted_invoice_id IS NULL
     AND COALESCE(e.created_via,'')<>'hotel_sheet_import';
  IF v_est IS NOT NULL THEN PERFORM public.hotel_quote_sync_grooms(v_est); END IF;
  RETURN COALESCE(NEW, OLD);
END $$;
DROP TRIGGER IF EXISTS trg_hotel_groom_requests_quote_sync ON public.hotel_grooming_requests;
CREATE TRIGGER trg_hotel_groom_requests_quote_sync AFTER INSERT OR DELETE OR UPDATE OF package_id, addon_ids, status ON public.hotel_grooming_requests
FOR EACH ROW EXECUTE FUNCTION public.hotel_groom_requests_quote_sync();

CREATE OR REPLACE FUNCTION public.estimates_mark_billed_grooms()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  UPDATE public.hotel_grooming_requests gr SET billed_invoice_id=NEW.converted_invoice_id
   WHERE gr.id IN (SELECT ei.source_id FROM public.estimate_items ei WHERE ei.estimate_id=NEW.id AND ei.source_type='hotel_groom')
     AND gr.billed_invoice_id IS NULL;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_estimates_mark_billed_grooms ON public.estimates;
CREATE TRIGGER trg_estimates_mark_billed_grooms AFTER UPDATE OF converted_invoice_id ON public.estimates
FOR EACH ROW WHEN (NEW.converted_invoice_id IS NOT NULL AND OLD.converted_invoice_id IS DISTINCT FROM NEW.converted_invoice_id)
EXECUTE FUNCTION public.estimates_mark_billed_grooms();

-- Scheduling a groom that is already on the hotel invoice links to it instead of billing again.
CREATE OR REPLACE FUNCTION public.schedule_hotel_groom(p_request_id uuid, p_start_at timestamp with time zone, p_end_at timestamp with time zone, p_package_id uuid DEFAULT NULL::uuid, p_resource_id uuid DEFAULT NULL::uuid, p_notes text DEFAULT NULL::text)
 RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_r public.hotel_grooming_requests%ROWTYPE;
  v_hotel public.bookings%ROWTYPE;
  v_booking_id uuid; v_num text; v_minutes integer;
  legacy_billed boolean:=false; legacy_auto boolean; v_billed_inv uuid; v_suppress boolean:=false;
BEGIN
  SELECT * INTO v_r FROM public.hotel_grooming_requests WHERE id = p_request_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Request not found'; END IF;
  IF NOT public.user_has_tenant_access(v_r.tenant_id) THEN RAISE EXCEPTION 'Not authorised'; END IF;
  SELECT i.id INTO v_billed_inv FROM public.invoices i WHERE i.id=v_r.billed_invoice_id AND i.status::text<>'cancelled';
  IF v_billed_inv IS NOT NULL AND p_package_id IS NOT NULL AND v_r.package_id IS NOT NULL AND p_package_id<>v_r.package_id THEN
    RAISE EXCEPTION 'This groom is already on the hotel invoice with its chosen package. Keep that package, or use Adjust & re-bill to change it.';
  END IF;
  p_package_id := COALESCE(p_package_id,v_r.package_id);
  IF p_package_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.grooming_packages gp WHERE gp.id=p_package_id AND gp.tenant_id=v_r.tenant_id AND gp.active) THEN RAISE EXCEPTION 'Choose an active grooming package for this account'; END IF;
  IF v_r.status = 'scheduled' THEN RAISE EXCEPTION 'Already scheduled'; END IF;
  IF v_r.pet_id IS NULL THEN RAISE EXCEPTION 'This request has no linked pet — link the pet first'; END IF;

  SELECT * INTO v_hotel FROM public.bookings WHERE id = v_r.hotel_booking_id;
  SELECT EXISTS(SELECT 1 FROM public.estimates e WHERE e.booking_id=v_hotel.id AND e.tenant_id=v_r.tenant_id AND e.created_via='hotel_sheet_import' AND (e.extras->'legacy_hotel_import'->'billed_groom_pet_ids') ? v_r.pet_id::text) INTO legacy_billed;

  IF NOT legacy_billed AND v_billed_inv IS NULL AND EXISTS(
    SELECT 1 FROM public.estimates e CROSS JOIN LATERAL jsonb_array_elements(coalesce(nullif(e.extras->'legacy_hotel_import'->'source_invoice','null'::jsonb),e.extras->'legacy_hotel_import'->'source_quote')->'LineItems') li
    WHERE e.booking_id=v_hotel.id AND e.created_via='hotel_sheet_import' AND coalesce(li->>'ItemCode','') ~* '^(DG|CG)'
  ) THEN RAISE EXCEPTION 'The imported hotel bill includes grooming but its pet allocation needs review; do not charge another groom until this is checked'; END IF;
  IF legacy_billed THEN
    IF v_hotel.invoice_id IS NULL THEN RAISE EXCEPTION 'This groom is included in the imported hotel quote; confirm the hotel invoice before scheduling it'; END IF;
    IF cardinality(coalesce(v_r.addon_ids,'{}'::uuid[]))>0 THEN RAISE EXCEPTION 'This imported groom is already billed; review any new extras separately before scheduling'; END IF;
    v_billed_inv := v_hotel.invoice_id;
  END IF;
  v_suppress := v_billed_inv IS NOT NULL;
  IF v_suppress THEN
    SELECT auto_invoice_grooming INTO legacy_auto FROM public.invoicing_settings WHERE tenant_id=v_r.tenant_id FOR UPDATE;
    UPDATE public.invoicing_settings SET auto_invoice_grooming=false WHERE tenant_id=v_r.tenant_id;
  END IF;

  IF p_start_at::date < COALESCE(v_r.window_start, p_start_at::date)
     OR p_start_at::date > COALESCE(v_r.window_end, p_start_at::date) THEN
    RAISE EXCEPTION 'Slot must fall inside the hotel stay (% to %)', v_r.window_start, v_r.window_end;
  END IF;

  v_num := public.next_booking_number(v_r.tenant_id);
  INSERT INTO public.bookings(tenant_id, customer_id, booking_number, service_type, source, status,
    start_at, end_at, start_date, end_date, resource_id, notes_internal)
  VALUES (v_r.tenant_id, v_r.customer_id, v_num, 'grooming_inhouse', 'staff_capture', 'confirmed',
    p_start_at, p_end_at, p_start_at::date, COALESCE(p_end_at, p_start_at)::date, p_resource_id,
    'Hotel guest groom — stay ' || COALESCE(v_hotel.booking_number,''))
  RETURNING id INTO v_booking_id;

  IF v_suppress THEN
    UPDATE public.bookings SET invoice_id=v_billed_inv, parent_booking_id=v_hotel.id,
      notes_internal=coalesce(notes_internal,'')||E'\nGroom already included on the hotel invoice; no additional charge.'
     WHERE id=v_booking_id;
  END IF;

  INSERT INTO public.booking_pets(tenant_id, booking_id, pet_id) VALUES (v_r.tenant_id, v_booking_id, v_r.pet_id);

  UPDATE public.hotel_grooming_requests
     SET status='scheduled', grooming_booking_id=v_booking_id, scheduled_at=now(),
         handled_by=public.current_profile_id(), updated_at=now()
   WHERE id = p_request_id;

  IF p_package_id IS NOT NULL THEN
    SELECT expected_minutes INTO v_minutes FROM public.grooming_packages WHERE id = p_package_id;
  END IF;
  INSERT INTO public.grooming_booking_details(tenant_id, booking_id, grooming_mode, package_id, duration_minutes, grooming_notes)
  VALUES (v_r.tenant_id, v_booking_id, 'inhouse', p_package_id, v_minutes,
    NULLIF(TRIM(COALESCE(v_r.customer_notes,'') || CASE WHEN p_notes IS NOT NULL THEN E'\n' || p_notes ELSE '' END), ''));

  INSERT INTO public.grooming_booking_addons(tenant_id,booking_id,addon_id,addon_code,addon_name,qty,price_zar_snapshot)
    SELECT v_r.tenant_id,v_booking_id,ga.id,ga.code,ga.name,1,ga.price_zar FROM public.grooming_addons ga
    WHERE ga.id=ANY(v_r.addon_ids) AND ga.tenant_id=v_r.tenant_id;
  UPDATE public.bookings SET requires_grooming = true WHERE id = v_r.hotel_booking_id;

  IF v_suppress THEN
    UPDATE public.invoicing_settings SET auto_invoice_grooming=legacy_auto WHERE tenant_id=v_r.tenant_id;
  END IF;
  RETURN v_booking_id;
END; $function$;