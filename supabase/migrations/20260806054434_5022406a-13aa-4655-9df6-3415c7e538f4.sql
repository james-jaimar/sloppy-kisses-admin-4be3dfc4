CREATE POLICY "hotel_rate_cards_customer_select" ON public.hotel_rate_cards
FOR SELECT TO authenticated
USING (active AND tenant_id IN (SELECT c.tenant_id FROM public.customers c WHERE c.linked_profile_id = public.current_profile_id()));

CREATE POLICY "hotel_surcharges_customer_select" ON public.hotel_surcharges
FOR SELECT TO authenticated
USING (active AND tenant_id IN (SELECT c.tenant_id FROM public.customers c WHERE c.linked_profile_id = public.current_profile_id()));

CREATE POLICY "daycare_plans_customer_select" ON public.daycare_plans
FOR SELECT TO authenticated
USING (active AND tenant_id IN (SELECT c.tenant_id FROM public.customers c WHERE c.linked_profile_id = public.current_profile_id()));