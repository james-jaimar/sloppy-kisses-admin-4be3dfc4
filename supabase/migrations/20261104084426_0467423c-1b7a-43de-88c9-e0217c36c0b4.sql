DO $fix$ DECLARE d text; BEGIN
 d:=pg_get_functiondef('public.import_new_stock(uuid,uuid,jsonb,uuid)'::regprocedure);
 d:=replace(d,'code text;','v_import_code text;');
 d:=replace(d,'code:=','v_import_code:=');
 d:=replace(d,'code IS NOT NULL','v_import_code IS NOT NULL');
 d:=replace(d,'lower(code)','lower(v_import_code)');
 d:=replace(d,'n,field,code','n,field,v_import_code');
 d:=replace(d,'pb.code=code','pb.code=v_import_code');
 EXECUTE d;
END $fix$;
DO $$
DECLARE t uuid; u uuid; loc uuid; batch uuid:=gen_random_uuid(); code text:='TEST-'||gen_random_uuid(); n integer;
BEGIN
 SELECT tu.tenant_id,p.auth_user_id INTO t,u FROM public.tenant_users tu JOIN public.profiles p ON p.id=tu.profile_id JOIN public.user_roles ur ON ur.tenant_user_id=tu.id JOIN public.role_permissions rp ON rp.role_id=ur.role_id JOIN public.permissions perm ON perm.id=rp.permission_id WHERE tu.status='active' AND perm.code IN ('products.manage','stock.adjust') GROUP BY tu.tenant_id,p.auth_user_id HAVING count(DISTINCT perm.code)=2 LIMIT 1;
 SELECT id INTO loc FROM public.stock_locations WHERE tenant_id=t AND active LIMIT 1;
 IF u IS NULL OR loc IS NULL THEN RAISE EXCEPTION 'Stock test fixtures unavailable'; END IF;
 BEGIN
  PERFORM set_config('request.jwt.claim.sub',u::text,true);
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',u,'role','authenticated')::text,true);
  SET LOCAL ROLE authenticated;
  n:=public.import_new_stock(t,loc,jsonb_build_array(jsonb_build_object('name','Test stock','sku',code,'initial_stock',12,'sell_price',99.50)),batch);
  IF n<>1 OR NOT EXISTS(SELECT 1 FROM public.stock_movements sm JOIN public.products p ON p.id=sm.product_id WHERE p.sku=code AND sm.qty_delta=12 AND sm.reason='receive' AND sm.ref_id=batch) THEN RAISE EXCEPTION 'Opening stock must create an audited receive movement'; END IF;
  BEGIN
   PERFORM public.import_new_stock(t,loc,jsonb_build_array(jsonb_build_object('name','Partial','sku',code||'-partial','initial_stock',3),jsonb_build_object('name','Duplicate','sku',code,'initial_stock',1)),gen_random_uuid());
   RAISE EXCEPTION 'Duplicate import incorrectly succeeded';
  EXCEPTION WHEN OTHERS THEN
   IF SQLERRM NOT LIKE '%already exists%' THEN RAISE; END IF;
  END;
  IF EXISTS(SELECT 1 FROM public.products WHERE sku=code||'-partial') THEN RAISE EXCEPTION 'Import must roll back every row on failure'; END IF;
  PERFORM set_config('request.jwt.claim.sub','',true);
  PERFORM set_config('request.jwt.claims','{}',true);
  BEGIN
   PERFORM public.import_new_stock(t,loc,'[{"name":"Blocked","initial_stock":1}]',gen_random_uuid());
   RAISE EXCEPTION 'Signed-out import incorrectly succeeded';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE '%permissions required%' THEN RAISE; END IF; END;
  RESET ROLE;
  RAISE EXCEPTION USING ERRCODE='P0002',MESSAGE='STOCK_TEST_ROLLBACK';
 EXCEPTION WHEN no_data_found THEN IF SQLERRM<>'STOCK_TEST_ROLLBACK' THEN RAISE; END IF; END;
END $$;