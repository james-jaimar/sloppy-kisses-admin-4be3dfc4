ALTER FUNCTION public.draft_hotel_pet_removal_credit(uuid, jsonb) SET SCHEMA hotel_private;
REVOKE ALL ON FUNCTION hotel_private.draft_hotel_pet_removal_credit(uuid, jsonb) FROM public, anon;
GRANT EXECUTE ON FUNCTION hotel_private.draft_hotel_pet_removal_credit(uuid, jsonb) TO authenticated;
CREATE OR REPLACE FUNCTION public.draft_hotel_pet_removal_credit(p_booking_id uuid, p_old_pets jsonb)
RETURNS uuid LANGUAGE sql SECURITY INVOKER SET search_path TO 'public'
AS $$ SELECT hotel_private.draft_hotel_pet_removal_credit(p_booking_id, p_old_pets) $$;
REVOKE ALL ON FUNCTION public.draft_hotel_pet_removal_credit(uuid, jsonb) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.draft_hotel_pet_removal_credit(uuid, jsonb) TO authenticated;