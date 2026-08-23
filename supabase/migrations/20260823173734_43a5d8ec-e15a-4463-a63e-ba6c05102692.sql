REVOKE ALL ON FUNCTION public.expire_quote_holds() FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.expire_quote_holds() TO service_role;

REVOKE ALL ON FUNCTION public.portal_hotel_quote_settings(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.portal_hotel_quote_settings(uuid) TO authenticated, service_role;