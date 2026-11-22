DO $$ DECLARE d text; BEGIN
SELECT pg_get_functiondef('public.import_hotel_sheet_20261122(jsonb)'::regprocedure) INTO d;
d:=replace(d,'source_key:=''[hotel-sheet-2026-11-22:row:''||(r->>''source_row'')||'']'';',$patch$
   source_key:='[hotel-sheet-2026-11-22:row:'||(r->>'source_row')||']';
   IF EXISTS(SELECT 1 FROM public.closures cl WHERE cl.tenant_id=t AND (r->>'start_date')::date BETWEEN cl.start_date AND cl.end_date AND (cardinality(cl.services)=0 OR public.service_group(r->>'service_type')=ANY(cl.services))) THEN
     r:=jsonb_set(r,'{notes}',to_jsonb((r->>'notes')||E'\nExisting spreadsheet reservation on a closed date; imported date retained with booking-level override. Staff must review arrival arrangements.'));
     r:=jsonb_set(r,'{warnings}',coalesce(r->'warnings','[]')||jsonb_build_array('Existing reservation falls on a closed date; review arrival arrangements.'));
   END IF;
$patch$);
d:=replace(d,'notes_internal,suppress_initial_emails,requires_grooming)','notes_internal,suppress_initial_emails,requires_grooming,closure_override)');
d:=replace(d,$old$true,jsonb_array_length(r->'grooming')>0);$old$,$new$true,jsonb_array_length(r->'grooming')>0,EXISTS(SELECT 1 FROM public.closures cl WHERE cl.tenant_id=t AND (r->>'start_date')::date BETWEEN cl.start_date AND cl.end_date AND (cardinality(cl.services)=0 OR public.service_group(r->>'service_type')=ANY(cl.services))));$new$);
EXECUTE d;
END $$;