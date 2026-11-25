ALTER FUNCTION public.hotel_paperwork_alerts(uuid,integer) SET SCHEMA hotel_private;
GRANT EXECUTE ON FUNCTION hotel_private.hotel_paperwork_alerts(uuid,integer) TO authenticated;
CREATE FUNCTION public.hotel_paperwork_alerts(p_tenant_id uuid, p_days integer DEFAULT 60)
RETURNS TABLE(booking_id uuid, booking_number text, start_date date, customer_name text, pet_names text, issues text[])
LANGUAGE sql STABLE SECURITY INVOKER SET search_path TO 'public'
AS $$ SELECT * FROM hotel_private.hotel_paperwork_alerts(p_tenant_id, p_days) $$;
REVOKE ALL ON FUNCTION public.hotel_paperwork_alerts(uuid,integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hotel_paperwork_alerts(uuid,integer) TO authenticated;