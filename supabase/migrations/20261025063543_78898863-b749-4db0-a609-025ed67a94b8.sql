CREATE SCHEMA IF NOT EXISTS hotel_private; REVOKE ALL ON SCHEMA hotel_private FROM PUBLIC,anon; GRANT USAGE ON SCHEMA hotel_private TO authenticated,service_role;
ALTER FUNCTION public.hotel_review_action(uuid,text,jsonb) SET SCHEMA hotel_private;
CREATE FUNCTION public.hotel_review_action(p_booking_id uuid,p_action text,p_data jsonb DEFAULT '{}') RETURNS uuid LANGUAGE sql SECURITY INVOKER SET search_path=public AS $$ SELECT hotel_private.hotel_review_action(p_booking_id,p_action,p_data) $$;
REVOKE ALL ON FUNCTION public.hotel_review_action(uuid,text,jsonb) FROM PUBLIC,anon; GRANT EXECUTE ON FUNCTION public.hotel_review_action(uuid,text,jsonb) TO authenticated;
