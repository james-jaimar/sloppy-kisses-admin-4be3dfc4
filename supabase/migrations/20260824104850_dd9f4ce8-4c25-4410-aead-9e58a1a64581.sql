REVOKE EXECUTE ON FUNCTION public.sync_hotel_transport_legs(uuid) FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public._strip_transport_leg_lines(uuid) FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.hotel_booking_transport_sync() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.hotel_details_transport_sync() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.bookings_cancel_linked_children() FROM anon, authenticated, public;
GRANT EXECUTE ON FUNCTION public.sync_hotel_transport_legs(uuid) TO service_role;