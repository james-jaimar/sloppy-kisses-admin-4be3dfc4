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
    JOIN public.bookings b ON b.id=r.booking_id
   WHERE r.booking_id=v_booking AND r.confirmed_at IS NULL AND r.verified_payment_id IS NULL AND b.invoice_id IS NULL
     AND e.status::text IN ('draft','sent','accepted') AND e.converted_invoice_id IS NULL
     AND (e.status::text<>'accepted' OR COALESCE(e.created_via,'')='hotel_sheet_import');
  IF v_est IS NOT NULL THEN PERFORM public.hotel_quote_sync_grooms(v_est); END IF;
  RETURN COALESCE(NEW, OLD);
END $$;
REVOKE ALL ON FUNCTION public.hotel_groom_requests_quote_sync() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.hotel_quote_sync_grooms(p_estimate_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE e public.estimates; ws public.hotel_workflow_settings; v_pct numeric; v_total numeric; v_sort int; v_billed jsonb := '[]'::jsonb;
BEGIN
  SELECT * INTO e FROM public.estimates WHERE id=p_estimate_id;
  IF e.id IS NULL OR e.booking_id IS NULL THEN RETURN; END IF;
  IF e.created_via='hotel_sheet_import' THEN
    -- Ambiguous imported grooming: never add another charge automatically.
    IF EXISTS (SELECT 1 FROM jsonb_array_elements(coalesce(nullif(e.extras->'legacy_hotel_import'->'source_invoice','null'::jsonb),e.extras->'legacy_hotel_import'->'source_quote')->'LineItems') li
               WHERE coalesce(li->>'ItemCode','') ~* '^(DG|CG)')
       AND NOT (e.extras->'legacy_hotel_import' ? 'billed_groom_pet_ids') THEN RETURN; END IF;
    v_billed := COALESCE(e.extras->'legacy_hotel_import'->'billed_groom_pet_ids','[]'::jsonb);
  END IF;
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
    AND NOT (v_billed ? COALESCE(gr.pet_id::text,''))
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
    AND NOT (v_billed ? COALESCE(gr.pet_id::text,''))
    AND NOT EXISTS (SELECT 1 FROM public.bookings gb WHERE gb.id=gr.grooming_booking_id AND gb.invoice_id IS NOT NULL);
  SELECT COALESCE(SUM(line_total),0) INTO v_total FROM public.estimate_items WHERE estimate_id=e.id;
  UPDATE public.estimates SET subtotal=v_total,total=v_total,
    extras=CASE WHEN extras ? 'payment_percent' THEN extras||jsonb_build_object('payment_due',ROUND(v_total*COALESCE((extras->>'payment_percent')::numeric,100)/100,2)) ELSE extras END
  WHERE id=e.id AND (total IS DISTINCT FROM v_total OR subtotal IS DISTINCT FROM v_total);
END $$;
REVOKE ALL ON FUNCTION public.hotel_quote_sync_grooms(uuid) FROM PUBLIC, anon, authenticated;