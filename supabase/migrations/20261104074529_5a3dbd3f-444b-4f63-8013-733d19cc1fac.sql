CREATE OR REPLACE FUNCTION public.grooming_enforce_travel_fee()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_b public.bookings; v_default numeric; BEGIN
 SELECT * INTO v_b FROM public.bookings WHERE id=NEW.booking_id;
 IF v_b.service_type='grooming_mobile' THEN
   -- Serialize grouped pets so concurrent staff/portal saves cannot charge twice.
   IF v_b.booking_group_id IS NOT NULL THEN
     PERFORM pg_advisory_xact_lock(hashtextextended(v_b.tenant_id::text||v_b.booking_group_id::text,0));
     IF EXISTS (SELECT 1 FROM public.bookings b JOIN public.grooming_booking_details d ON d.booking_id=b.id
       WHERE b.tenant_id=v_b.tenant_id AND b.booking_group_id=v_b.booking_group_id AND b.id<>v_b.id
       AND b.service_type='grooming_mobile' AND b.status NOT IN ('cancelled','no_show')
       AND b.service_address_id IS NOT DISTINCT FROM v_b.service_address_id
       AND b.resource_id IS NOT DISTINCT FROM v_b.resource_id
       AND (b.start_at AT TIME ZONE 'Africa/Johannesburg')::date=(v_b.start_at AT TIME ZONE 'Africa/Johannesburg')::date
       AND COALESCE(d.travel_fee,0)>0) THEN NEW.travel_fee:=0; RETURN NEW; END IF;
   END IF;
   IF COALESCE(NEW.travel_fee,0)=0 THEN
     SELECT COALESCE(default_mobile_travel_fee_zar,0) INTO v_default FROM public.grooming_workflow_settings WHERE tenant_id=NEW.tenant_id LIMIT 1;
     NEW.travel_fee:=COALESCE(v_default,0);
   END IF;
 ELSE NEW.travel_fee:=0; END IF;
 RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION public.grooming_enforce_travel_fee() FROM PUBLIC, anon, authenticated;