CREATE POLICY pet_parasite_treatments_customer_insert_own ON public.pet_parasite_treatments
  FOR INSERT TO authenticated
  WITH CHECK (public.user_can_access_pet(tenant_id, pet_id));

CREATE POLICY pet_parasite_treatments_customer_update_own ON public.pet_parasite_treatments
  FOR UPDATE TO authenticated
  USING (public.user_can_access_pet(tenant_id, pet_id))
  WITH CHECK (public.user_can_access_pet(tenant_id, pet_id));