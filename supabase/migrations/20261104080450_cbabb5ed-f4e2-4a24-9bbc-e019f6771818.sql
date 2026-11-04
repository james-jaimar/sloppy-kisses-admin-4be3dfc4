ALTER TABLE public.hotel_grooming_requests ADD COLUMN IF NOT EXISTS package_id uuid REFERENCES public.grooming_packages(id);
DO $$ DECLARE d text; BEGIN
 d:=pg_get_functiondef('public.sync_hotel_grooming_requests(uuid,jsonb)'::regprocedure);
 d:=replace(d,'v_keep := array_append(v_keep, v_id);',E'UPDATE public.hotel_grooming_requests SET package_id = (SELECT gp.id FROM public.grooming_packages gp WHERE gp.id::text=v_pet->>\'grooming_package_id\' AND gp.tenant_id=v_b.tenant_id AND gp.active) WHERE id=v_id AND status=\'pending\' AND v_pet ? \'grooming_package_id\';\n    v_keep := array_append(v_keep, v_id);');
 -- The legacy loop does not contain a pet payload; only patch the first occurrence.
 d:=replace(d,E'UPDATE public.hotel_grooming_requests SET package_id = (SELECT gp.id FROM public.grooming_packages gp WHERE gp.id::text=v_pet->>\'grooming_package_id\' AND gp.tenant_id=v_b.tenant_id AND gp.active) WHERE id=v_id AND status=\'pending\' AND v_pet ? \'grooming_package_id\';\n    v_keep := array_append(v_keep, v_id);\n    END LOOP;',E'v_keep := array_append(v_keep, v_id);\n    END LOOP;');
 EXECUTE d;
 d:=pg_get_functiondef('public.schedule_hotel_groom(uuid,timestamp with time zone,timestamp with time zone,uuid,uuid,text)'::regprocedure);
 d:=replace(d,'IF v_r.status = ''scheduled'' THEN',E'p_package_id := COALESCE(p_package_id,v_r.package_id);\n  IF p_package_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.grooming_packages gp WHERE gp.id=p_package_id AND gp.tenant_id=v_r.tenant_id AND gp.active) THEN RAISE EXCEPTION \'Choose an active grooming package for this account\'; END IF;\n  IF v_r.status = \'scheduled\' THEN');
 EXECUTE d;
END $$;