-- Live regression checks; the resave exercise rolls back inside a subtransaction.
DO $tests$
DECLARE t uuid:='75cc6a9e-9d17-4268-92ee-8b595c842dee'; r record; n integer; original_invoices text; original_items text; original_queues text; original_messages text;
BEGIN
 SELECT count(*) INTO n FROM public.bookings WHERE tenant_id=t AND notes_internal LIKE '%Imported hotel transport: hotel-sheet-2026-11-22%';
 IF n<>10 THEN RAISE EXCEPTION 'Expected ten transport legs, got %',n; END IF;
 IF (SELECT count(*) FROM public.bookings WHERE tenant_id=t AND notes_internal LIKE '%Imported hotel transport: hotel-sheet-2026-11-22%' AND status='requested')<>9 THEN RAISE EXCEPTION 'Nine future trips must remain available for staff review'; END IF;
 FOR r IN SELECT * FROM (VALUES
  ('ad0ee58c-af7c-5a3e-8234-518d676f5350'::uuid,'pickup','2026-11-20 15:30'::timestamp,'completed'),
  ('ad0ee58c-af7c-5a3e-8234-518d676f5350'::uuid,'dropoff','2026-11-23 16:00'::timestamp,'requested'),
  ('87fd0548-66f5-533a-8c50-541653cdef66'::uuid,'pickup','2026-12-03 09:00'::timestamp,'requested'),
  ('87fd0548-66f5-533a-8c50-541653cdef66'::uuid,'dropoff','2026-12-11 16:00'::timestamp,'requested'),
  ('394431a5-c724-5c51-ae2f-703ffbac752a'::uuid,'pickup','2026-12-12 10:00'::timestamp,'requested'),
  ('7f7dc8e1-5efc-5915-b2b7-7ebc2b907039'::uuid,'pickup','2026-12-17 09:00'::timestamp,'requested'),
  ('1bb8409f-eb73-5f25-bf35-0ea3c2f0d4c9'::uuid,'pickup','2026-12-17 09:45'::timestamp,'requested'),
  ('1bb8409f-eb73-5f25-bf35-0ea3c2f0d4c9'::uuid,'dropoff','2026-12-31 12:00'::timestamp,'requested'),
  ('a3429667-547f-5bb3-9c6c-f39bd7ee6521'::uuid,'pickup','2026-12-29 09:00'::timestamp,'requested'),
  ('a3429667-547f-5bb3-9c6c-f39bd7ee6521'::uuid,'dropoff','2027-01-05 16:00'::timestamp,'requested')
 ) x(parent_id,direction,local_start,expected_status) LOOP
  SELECT count(*) INTO n FROM public.bookings b JOIN public.transport_details d ON d.booking_id=b.id WHERE b.tenant_id=t AND b.parent_booking_id=r.parent_id AND b.link_kind='hotel_transport_'||r.direction AND d.direction=r.direction AND (b.start_at AT TIME ZONE 'Africa/Johannesburg')=r.local_start AND b.status::text=r.expected_status;
  IF n<>1 THEN RAISE EXCEPTION 'Missing/duplicate/wrong trip: % % %',r.parent_id,r.direction,r.local_start; END IF;
 END LOOP;
 IF EXISTS(SELECT 1 FROM public.bookings WHERE tenant_id=t AND parent_booking_id IN ('394431a5-c724-5c51-ae2f-703ffbac752a','7f7dc8e1-5efc-5915-b2b7-7ebc2b907039') AND link_kind='hotel_transport_dropoff') THEN RAISE EXCEPTION 'Owner-collected stays must not have return trips'; END IF;
 IF EXISTS(SELECT 1 FROM public.bookings b WHERE b.tenant_id=t AND b.notes_internal LIKE '%Imported hotel transport: hotel-sheet-2026-11-22%' AND (b.resource_id IS DISTINCT FROM 'b84c00ea-117e-4920-b750-aaaeb7a975dc'::uuid OR b.service_type<>'pickup_dropoff' OR EXISTS((SELECT pet_id FROM public.booking_pets WHERE booking_id=b.id EXCEPT SELECT pet_id FROM public.booking_pets WHERE booking_id=b.parent_booking_id) UNION ALL (SELECT pet_id FROM public.booking_pets WHERE booking_id=b.parent_booking_id EXCEPT SELECT pet_id FROM public.booking_pets WHERE booking_id=b.id)))) THEN RAISE EXCEPTION 'Trip vehicle, service or linked pets differ from approved stays'; END IF;
 IF (SELECT count(*) FROM public.booking_pets bp JOIN public.bookings b ON b.id=bp.booking_id WHERE b.tenant_id=t AND b.notes_internal LIKE '%Imported hotel transport: hotel-sheet-2026-11-22%')<>20 THEN RAISE EXCEPTION 'Expected twenty pet-trip links'; END IF;
 IF EXISTS(SELECT 1 FROM public.bookings a JOIN public.bookings b ON a.resource_id=b.resource_id AND a.id<>b.id AND a.start_at<b.end_at AND b.start_at<a.end_at WHERE a.tenant_id=t AND a.notes_internal LIKE '%Imported hotel transport: hotel-sheet-2026-11-22%' AND b.status NOT IN ('cancelled','no_show')) THEN RAISE EXCEPTION 'Transport vehicle overlap'; END IF;
 IF EXISTS(SELECT 1 FROM public.bookings b JOIN public.bookings g ON g.parent_booking_id=b.parent_booking_id AND g.service_type='grooming_inhouse' AND (g.end_at AT TIME ZONE 'Africa/Johannesburg')::date=(b.start_at AT TIME ZONE 'Africa/Johannesburg')::date WHERE b.parent_booking_id IN ('ad0ee58c-af7c-5a3e-8234-518d676f5350','87fd0548-66f5-533a-8c50-541653cdef66') AND b.link_kind='hotel_transport_dropoff' AND b.start_at<g.end_at) THEN RAISE EXCEPTION 'Return trip must be after both grooms'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.bookings b JOIN public.transport_details d ON d.booking_id=b.id WHERE b.parent_booking_id='394431a5-c724-5c51-ae2f-703ffbac752a' AND b.link_kind='hotel_transport_pickup' AND b.service_address_id IS NULL AND d.pickup_address IS NULL AND b.status='requested') THEN RAISE EXCEPTION 'Adrian has no address yet: do not invent one'; END IF;
 IF (SELECT count(*) FROM public.booking_pets bp JOIN public.bookings b ON b.id=bp.booking_id JOIN public.pets p ON p.id=bp.pet_id WHERE b.parent_booking_id='394431a5-c724-5c51-ae2f-703ffbac752a' AND b.link_kind='hotel_transport_pickup' AND p.species='cat')<>2 THEN RAISE EXCEPTION 'Adrian pickup includes two cats needing secure carriers'; END IF;
 IF (SELECT count(*) FROM public.bookings b JOIN public.transport_details d ON d.booking_id=b.id WHERE b.parent_booking_id='a3429667-547f-5bb3-9c6c-f39bd7ee6521' AND b.service_address_id='25e51eb3-7d6a-440a-9a99-5e8c08ceee7b' AND CASE WHEN d.direction='pickup' THEN d.pickup_address_id ELSE d.dropoff_address_id END='25e51eb3-7d6a-440a-9a99-5e8c08ceee7b'::uuid)<>2 THEN RAISE EXCEPTION 'Both Blu trips must use the confirmed saved home address'; END IF;
 SELECT md5(coalesce(jsonb_agg(to_jsonb(i) ORDER BY i.id)::text,'[]')) INTO original_invoices FROM public.invoices i WHERE tenant_id=t;
 SELECT md5(coalesce(jsonb_agg(to_jsonb(i) ORDER BY i.id)::text,'[]')) INTO original_items FROM public.invoice_items i WHERE tenant_id=t;
 SELECT md5(coalesce(jsonb_agg(to_jsonb(i) ORDER BY i.id)::text,'[]')) INTO original_queues FROM public.xero_sync_queue i WHERE tenant_id=t;
 SELECT md5(coalesce(jsonb_agg(to_jsonb(i) ORDER BY i.id)::text,'[]')) INTO original_messages FROM public.notification_events i WHERE tenant_id=t;
 FOR r IN SELECT b.id,b.invoice_id FROM public.bookings b WHERE b.tenant_id=t AND b.notes_internal LIKE '%Imported hotel transport: hotel-sheet-2026-11-22%' LOOP
  IF public.ensure_booking_invoice(r.id) IS DISTINCT FROM r.invoice_id THEN RAISE EXCEPTION 'Imported trip must reuse its existing hotel invoice or stay quote-only'; END IF;
 END LOOP;
 BEGIN
  ALTER TABLE public.bookings DISABLE TRIGGER bookings_notify_changes_trg;
  FOR r IN SELECT DISTINCT parent_booking_id FROM public.bookings WHERE tenant_id=t AND notes_internal LIKE '%Imported hotel transport: hotel-sheet-2026-11-22%' LOOP
   PERFORM public.sync_hotel_transport_legs(r.parent_booking_id);
  END LOOP;
  IF NOT EXISTS(SELECT 1 FROM public.bookings WHERE parent_booking_id='394431a5-c724-5c51-ae2f-703ffbac752a' AND link_kind='hotel_transport_pickup' AND (start_at AT TIME ZONE 'Africa/Johannesburg')='2026-12-12 10:00'::timestamp AND status='requested') THEN RAISE EXCEPTION 'Same-day hotel resave lost Adrian explicit 10:00 review slot'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.bookings WHERE parent_booking_id='1bb8409f-eb73-5f25-bf35-0ea3c2f0d4c9' AND link_kind='hotel_transport_dropoff' AND (end_at AT TIME ZONE 'Africa/Johannesburg')<'2026-12-31 13:00'::timestamp AND status='requested') THEN RAISE EXCEPTION 'Same-day hotel resave lost before-13:00 return'; END IF;
  RAISE EXCEPTION USING ERRCODE='P0002',MESSAGE='rollback-only transport resave test';
 EXCEPTION WHEN SQLSTATE 'P0002' THEN NULL;
 END;
 IF original_invoices IS DISTINCT FROM (SELECT md5(coalesce(jsonb_agg(to_jsonb(i) ORDER BY i.id)::text,'[]')) FROM public.invoices i WHERE tenant_id=t) THEN RAISE EXCEPTION 'Test changed invoices'; END IF;
 IF original_items IS DISTINCT FROM (SELECT md5(coalesce(jsonb_agg(to_jsonb(i) ORDER BY i.id)::text,'[]')) FROM public.invoice_items i WHERE tenant_id=t) THEN RAISE EXCEPTION 'Test changed invoice lines'; END IF;
 IF original_queues IS DISTINCT FROM (SELECT md5(coalesce(jsonb_agg(to_jsonb(i) ORDER BY i.id)::text,'[]')) FROM public.xero_sync_queue i WHERE tenant_id=t) THEN RAISE EXCEPTION 'Test changed Xero queue'; END IF;
 IF original_messages IS DISTINCT FROM (SELECT md5(coalesce(jsonb_agg(to_jsonb(i) ORDER BY i.id)::text,'[]')) FROM public.notification_events i WHERE tenant_id=t) THEN RAISE EXCEPTION 'Test changed customer messages'; END IF;
 IF (SELECT sync_payments FROM public.xero_settings WHERE tenant_id=t) IS DISTINCT FROM false THEN RAISE EXCEPTION 'Payment sync must remain off'; END IF;
 IF (SELECT auto_invoice_transport FROM public.invoicing_settings WHERE tenant_id=t) IS DISTINCT FROM true THEN RAISE EXCEPTION 'Normal transport invoicing must remain enabled'; END IF;
 IF EXISTS(SELECT 1 FROM pg_trigger WHERE tgname IN ('bookings_notify_changes_trg','trg_hotel_booking_transport_sync','trg_hotel_details_transport_sync') AND tgenabled<>'O') THEN RAISE EXCEPTION 'Import triggers not restored'; END IF;
 RAISE NOTICE 'Transport import checks passed: ten trips, twenty pet links, saved addresses and no duplicate billing';
END $tests$;