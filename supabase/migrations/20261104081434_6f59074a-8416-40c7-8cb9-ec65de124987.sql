CREATE OR REPLACE FUNCTION public.import_new_stock(p_tenant_id uuid,p_location_id uuid,p_rows jsonb,p_import_id uuid) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r jsonb; pid uuid; qty numeric; vat numeric; cost numeric; sell numeric; reorder numeric; n integer:=0; code text; field text;
BEGIN
 IF auth.uid() IS NULL OR NOT public.user_has_permission(p_tenant_id,'products.manage') OR NOT public.user_has_permission(p_tenant_id,'stock.adjust') THEN RAISE EXCEPTION 'Product management and stock adjustment permissions required'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.stock_locations WHERE id=p_location_id AND tenant_id=p_tenant_id AND active) THEN RAISE EXCEPTION 'Choose an active stock location'; END IF;
 IF p_import_id IS NULL OR jsonb_typeof(p_rows)<>'array' OR jsonb_array_length(p_rows)<1 OR jsonb_array_length(p_rows)>1000 THEN RAISE EXCEPTION 'Provide 1 to 1000 product rows and an import reference'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_tenant_id::text||':stock-import',0));
 IF EXISTS(SELECT 1 FROM public.products WHERE tenant_id=p_tenant_id AND source_ref='stock-import:'||p_import_id::text) THEN RAISE EXCEPTION 'This import was already saved'; END IF;
 SELECT default_vat_rate INTO vat FROM public.retail_settings WHERE tenant_id=p_tenant_id;
 IF vat IS NULL THEN RAISE EXCEPTION 'Save the default VAT rate in Retail settings first'; END IF;
 FOR r IN SELECT value FROM jsonb_array_elements(p_rows) LOOP
  n:=n+1;
  IF NULLIF(trim(r->>'name'),'') IS NULL THEN RAISE EXCEPTION 'Row %: product name required',n; END IF;
  qty:= (r->>'initial_stock')::numeric; cost:=NULLIF(r->>'cost_price','')::numeric; sell:=NULLIF(r->>'sell_price','')::numeric; reorder:=NULLIF(r->>'reorder_level','')::numeric;
  IF qty IS NULL OR qty<0 OR qty::text IN ('NaN','Infinity','-Infinity') OR cost<0 OR sell<0 OR reorder<0 OR COALESCE(cost::text,'') IN ('NaN','Infinity','-Infinity') OR COALESCE(sell::text,'') IN ('NaN','Infinity','-Infinity') OR COALESCE(reorder::text,'') IN ('NaN','Infinity','-Infinity') THEN RAISE EXCEPTION 'Row %: quantities and prices must be finite and non-negative',n; END IF;
  IF COALESCE(NULLIF(r->>'vat_rate','')::numeric,vat)<0 OR COALESCE(NULLIF(r->>'vat_rate','')::numeric,vat)>100 OR COALESCE(NULLIF(r->>'vat_rate','')::numeric,vat)::text IN ('NaN','Infinity','-Infinity') THEN RAISE EXCEPTION 'Row %: invalid VAT rate',n; END IF;
  FOREACH field IN ARRAY ARRAY['sku','barcode','external_code'] LOOP
   code:=NULLIF(trim(r->>field),'');
   IF code IS NOT NULL AND EXISTS(SELECT 1 FROM public.products p WHERE p.tenant_id=p_tenant_id AND lower(trim(to_jsonb(p)->>field))=lower(code)) THEN RAISE EXCEPTION 'Row %: % already exists: %',n,field,code; END IF;
   IF field='barcode' AND code IS NOT NULL AND EXISTS(SELECT 1 FROM public.product_barcodes pb WHERE pb.tenant_id=p_tenant_id AND pb.code=code) THEN RAISE EXCEPTION 'Row %: barcode already linked',n; END IF;
  END LOOP;
  INSERT INTO public.products(tenant_id,name,sku,barcode,external_code,unit,cost_price,sell_price,vat_rate,reorder_level,description,source_ref)
  VALUES(p_tenant_id,trim(r->>'name'),NULLIF(trim(r->>'sku'),''),NULLIF(trim(r->>'barcode'),''),NULLIF(trim(r->>'external_code'),''),NULLIF(trim(r->>'unit'),''),cost,sell,COALESCE(NULLIF(r->>'vat_rate','')::numeric,vat),reorder,NULLIF(r->>'description',''),'stock-import:'||p_import_id::text) RETURNING id INTO pid;
  IF qty>0 THEN INSERT INTO public.stock_movements(tenant_id,product_id,location_id,qty_delta,reason,ref_type,ref_id,notes,created_by) VALUES(p_tenant_id,pid,p_location_id,qty,'receive','initial_stock_import',p_import_id,'Opening stock from CSV',auth.uid()); END IF;
 END LOOP;
 RETURN n;
END $$;
REVOKE ALL ON FUNCTION public.import_new_stock(uuid,uuid,jsonb,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.import_new_stock(uuid,uuid,jsonb,uuid) TO authenticated;