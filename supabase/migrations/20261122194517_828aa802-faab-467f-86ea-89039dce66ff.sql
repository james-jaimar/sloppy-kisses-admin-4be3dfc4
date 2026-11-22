DO $addresses$
DECLARE t uuid:='75cc6a9e-9d17-4268-92ee-8b595c842dee'; a public.customer_addresses; c uuid; n integer; before_messages bigint; b record; note text;
BEGIN
 SELECT customer_id INTO c FROM public.bookings WHERE id='a3429667-547f-5bb3-9c6c-f39bd7ee6521' AND tenant_id=t;
 SELECT * INTO a FROM public.customer_addresses WHERE id='25e51eb3-7d6a-440a-9a99-5e8c08ceee7b' AND customer_id=c AND tenant_id=t;
 IF a.id IS NULL THEN RAISE EXCEPTION 'Blu saved address not found'; END IF;
 SELECT count(*) INTO before_messages FROM public.notification_events WHERE tenant_id=t;
 ALTER TABLE public.bookings DISABLE TRIGGER bookings_notify_changes_trg;
 n:=0;
 FOR b IN SELECT id,link_kind,notes_internal FROM public.bookings WHERE tenant_id=t AND parent_booking_id='a3429667-547f-5bb3-9c6c-f39bd7ee6521' AND service_type='pickup_dropoff' AND notes_internal LIKE '%Imported hotel transport: hotel-sheet-2026-11-22%' LOOP
  note:=replace(b.notes_internal,'Address confirmation required before dispatch; time provisional.','James confirmed the saved home address for this trip; time provisional.');
  note:=replace(note,'Address confirmation required before dispatch; confirm destination rather than using old travel references.','James confirmed the saved home address for this trip; ignore old travel destinations.');
  UPDATE public.bookings SET service_address_id=a.id,service_address_text=coalesce(a.formatted_address,a.address_line_1),service_place_id=a.google_place_id,service_suburb=a.suburb,notes_internal=note WHERE id=b.id;
  UPDATE public.transport_details SET pickup_address=CASE WHEN direction='pickup' THEN coalesce(a.formatted_address,a.address_line_1) ELSE pickup_address END,dropoff_address=CASE WHEN direction='dropoff' THEN coalesce(a.formatted_address,a.address_line_1) ELSE dropoff_address END,pickup_address_id=CASE WHEN direction='pickup' THEN a.id ELSE pickup_address_id END,dropoff_address_id=CASE WHEN direction='dropoff' THEN a.id ELSE dropoff_address_id END,pickup_place_id=CASE WHEN direction='pickup' THEN a.google_place_id ELSE pickup_place_id END,dropoff_place_id=CASE WHEN direction='dropoff' THEN a.google_place_id ELSE dropoff_place_id END,suburb=a.suburb,gate_code=a.gate_code,driver_notes=note WHERE booking_id=b.id;
  n:=n+1;
 END LOOP;
 ALTER TABLE public.bookings ENABLE TRIGGER bookings_notify_changes_trg;
 IF n<>2 THEN RAISE EXCEPTION 'Expected two Blu trips, got %',n; END IF;
 IF before_messages<>(SELECT count(*) FROM public.notification_events WHERE tenant_id=t) THEN RAISE EXCEPTION 'Address update sent customer messages'; END IF;
 IF EXISTS(SELECT 1 FROM public.bookings WHERE tenant_id=t AND parent_booking_id='394431a5-c724-5c51-ae2f-703ffbac752a' AND service_type='pickup_dropoff' AND (service_address_id IS NOT NULL OR status<>'requested')) THEN RAISE EXCEPTION 'Adrian must remain pending without an invented address'; END IF;
END $addresses$;