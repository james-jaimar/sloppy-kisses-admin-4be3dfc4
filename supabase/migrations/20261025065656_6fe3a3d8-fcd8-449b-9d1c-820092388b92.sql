ALTER TABLE public.hotel_booking_surcharges ADD COLUMN quantity_basis text NOT NULL DEFAULT 'catalog';
CREATE FUNCTION public.hotel_walk_quantity_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$ BEGIN IF NEW.quantity_basis NOT IN ('catalog','total') OR NEW.quantity<1 OR NEW.quantity<>trunc(NEW.quantity) THEN RAISE EXCEPTION 'Choose whole-number extra quantities and a valid quantity basis'; END IF; RETURN NEW; END $$;
CREATE TRIGGER hotel_walk_quantity_guard BEFORE INSERT OR UPDATE ON public.hotel_booking_surcharges FOR EACH ROW EXECUTE FUNCTION public.hotel_walk_quantity_guard();
CREATE FUNCTION public.hotel_booking_stay_lines(p_booking_id uuid) RETURNS TABLE(description text,quantity numeric,unit_price numeric,line_total numeric) LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$ SELECT l.* FROM public.bookings b JOIN public.hotel_booking_details h ON h.booking_id=b.id CROSS JOIN LATERAL (SELECT p.species::text species,jsonb_agg(jsonb_build_object('name',p.name,'accommodation_type',COALESCE(bp.accommodation_type,h.accommodation_type))) pets FROM public.booking_pets bp JOIN public.pets p ON p.id=bp.pet_id WHERE bp.booking_id=b.id GROUP BY p.species) g CROSS JOIN LATERAL public.hotel_stay_lines_pets(b.tenant_id,g.species,COALESCE(b.start_date,b.start_at::date),COALESCE(b.end_date,b.end_at::date),g.pets) l WHERE b.id=p_booking_id $$;
REVOKE ALL ON FUNCTION public.hotel_booking_stay_lines(uuid) FROM PUBLIC,anon,authenticated; GRANT EXECUTE ON FUNCTION public.hotel_booking_stay_lines(uuid) TO service_role;
DO $m$ DECLARE d text; BEGIN
SELECT pg_get_functiondef('hotel_private.hotel_review_action(uuid,text,jsonb)'::regprocedure) INTO d;
d:=replace(d,'SELECT * FROM public.hotel_stay_lines_pets(b.tenant_id,species,st,en,pets_json)','SELECT * FROM public.hotel_booking_stay_lines(b.id)');
d:=replace(d,'CASE WHEN s.per_night THEN en-st ELSE 1 END','CASE WHEN s.per_night AND bs.quantity_basis<>''total'' THEN en-st ELSE 1 END');
EXECUTE d;
SELECT pg_get_functiondef('public.hotel_details_auto_invoice()'::regprocedure) INTO d;
d:=replace(d,'SELECT * FROM public.hotel_stay_lines_pets(NEW.tenant_id, v_species, v_start, v_end, v_pets)','SELECT * FROM public.hotel_booking_stay_lines(v_booking.id)');
d:=replace(d,'s.name, s.per_night','s.name, (s.per_night AND bs.quantity_basis<>''total'') AS per_night');
EXECUTE d;
END $m$;