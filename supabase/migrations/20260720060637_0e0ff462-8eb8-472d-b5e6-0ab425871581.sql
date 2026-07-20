
REVOKE ALL ON FUNCTION public._auto_invoice_enabled(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.daycare_enrolments_auto_invoice() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.grooming_details_auto_invoice() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.grooming_addons_auto_invoice() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.hotel_details_auto_invoice() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.transport_details_auto_invoice() FROM PUBLIC, anon, authenticated;
