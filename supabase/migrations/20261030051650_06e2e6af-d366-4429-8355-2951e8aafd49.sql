ALTER POLICY hotel_booking_surcharges_insert ON public.hotel_booking_surcharges WITH CHECK (
 (public.user_has_permission(tenant_id,'bookings.create') OR public.user_has_permission(tenant_id,'bookings.update') OR public.user_has_permission(tenant_id,'hotel.manage'))
 AND EXISTS (SELECT 1 FROM public.bookings b WHERE b.id=hotel_booking_surcharges.booking_id AND b.tenant_id=hotel_booking_surcharges.tenant_id AND b.service_type IN ('hotel_dog','hotel_cat'))
);
ALTER POLICY hotel_booking_surcharges_update ON public.hotel_booking_surcharges USING (
 (public.user_has_permission(tenant_id,'bookings.create') OR public.user_has_permission(tenant_id,'bookings.update') OR public.user_has_permission(tenant_id,'hotel.manage'))
 AND EXISTS (SELECT 1 FROM public.bookings b WHERE b.id=hotel_booking_surcharges.booking_id AND b.tenant_id=hotel_booking_surcharges.tenant_id AND b.service_type IN ('hotel_dog','hotel_cat'))
) WITH CHECK (
 (public.user_has_permission(tenant_id,'bookings.create') OR public.user_has_permission(tenant_id,'bookings.update') OR public.user_has_permission(tenant_id,'hotel.manage'))
 AND EXISTS (SELECT 1 FROM public.bookings b WHERE b.id=hotel_booking_surcharges.booking_id AND b.tenant_id=hotel_booking_surcharges.tenant_id AND b.service_type IN ('hotel_dog','hotel_cat'))
);
ALTER POLICY hotel_booking_surcharges_delete ON public.hotel_booking_surcharges USING (
 (public.user_has_permission(tenant_id,'bookings.create') OR public.user_has_permission(tenant_id,'bookings.update') OR public.user_has_permission(tenant_id,'hotel.manage'))
 AND EXISTS (SELECT 1 FROM public.bookings b WHERE b.id=hotel_booking_surcharges.booking_id AND b.tenant_id=hotel_booking_surcharges.tenant_id AND b.service_type IN ('hotel_dog','hotel_cat'))
);
CREATE POLICY hotel_booking_surcharges_customer_select ON public.hotel_booking_surcharges FOR SELECT TO authenticated USING (
 EXISTS (SELECT 1 FROM public.bookings b WHERE b.id=hotel_booking_surcharges.booking_id AND b.tenant_id=hotel_booking_surcharges.tenant_id AND b.customer_id=public.current_customer_id(b.tenant_id))
);