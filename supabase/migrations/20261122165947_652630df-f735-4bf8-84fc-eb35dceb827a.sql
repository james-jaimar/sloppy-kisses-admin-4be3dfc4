DO $$ DECLARE d text; BEGIN
 SELECT pg_get_functiondef('public.schedule_hotel_groom(uuid,timestamptz,timestamptz,uuid,uuid,text)'::regprocedure) INTO d;
 d:=replace(d,' IF legacy_billed THEN', $patch$
 IF NOT legacy_billed AND EXISTS(
  SELECT 1 FROM public.estimates e CROSS JOIN LATERAL jsonb_array_elements(coalesce(nullif(e.extras->'legacy_hotel_import'->'source_invoice','null'::jsonb),e.extras->'legacy_hotel_import'->'source_quote')->'LineItems') li
  WHERE e.booking_id=v_hotel.id AND e.created_via='hotel_sheet_import' AND coalesce(li->>'ItemCode','') ~* '^(DG|CG)'
 ) THEN RAISE EXCEPTION 'The imported hotel bill includes grooming but its pet allocation needs review; do not charge another groom until this is checked'; END IF;
 IF legacy_billed THEN
$patch$);
 EXECUTE d;
END $$;