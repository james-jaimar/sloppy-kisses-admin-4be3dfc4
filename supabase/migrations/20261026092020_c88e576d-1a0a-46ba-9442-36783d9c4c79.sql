DO $migration$
DECLARE d text; old_fragment text := 'q:=COALESCE((x->>''quantity'')::numeric,1)*(SELECT count(*) FROM public.booking_pets WHERE booking_id=b); IF sid IS NOT NULL THEN';
BEGIN
 d:=pg_get_functiondef('hotel_private.hotel_convert_enquiry(uuid)'::regprocedure);
 IF position(old_fragment in d)=0 THEN RAISE EXCEPTION 'Expected enquiry quantity calculation not found'; END IF;
 d:=replace(d,old_fragment,'q:=COALESCE((x->>''quantity'')::numeric,1)*(SELECT count(*) FROM public.booking_pets bp JOIN public.pets pt ON pt.id=bp.pet_id WHERE bp.booking_id=b AND (NOT (x->>''code'' ILIKE ''%walk%'' OR x->>''code''=''late_checkout'') OR pt.species=''dog'')); IF sid IS NOT NULL AND q>0 THEN');
 EXECUTE d;
 d:=pg_get_functiondef('public.accept_estimate(uuid)'::regprocedure);
 IF position('THEN ''requested''::public.booking_status' in d)=0 THEN RAISE EXCEPTION 'Expected quote acceptance state not found'; END IF;
 d:=replace(d,'THEN ''requested''::public.booking_status','THEN ''needs_info''::public.booking_status');
 EXECUTE d;
END $migration$;