REVOKE EXECUTE ON FUNCTION public.pets_sync_power_breed() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.parasite_treatments_set_due() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.daycare_enrolments_assessment_gate() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.pet_health_gate(uuid, date) FROM public;
GRANT EXECUTE ON FUNCTION public.pet_health_gate(uuid, date) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.charge_arrival_parasite_treatment(uuid, uuid, text, text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.charge_arrival_parasite_treatment(uuid, uuid, text, text, text) TO authenticated;