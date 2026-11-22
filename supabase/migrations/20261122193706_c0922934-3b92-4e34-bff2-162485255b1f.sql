-- Imported transport is already represented on the original hotel quote/invoice.
DO $guard$
DECLARE d text;
BEGIN
 SELECT pg_get_functiondef('public.transport_details_auto_invoice()'::regprocedure) INTO d;
 IF strpos(d,'Imported hotel transport billing guard')=0 THEN
  IF strpos(d,'IF v_booking.id IS NULL THEN RETURN NEW; END IF;')=0 THEN RAISE EXCEPTION 'Transport billing anchor missing'; END IF;
  d:=replace(d,'IF v_booking.id IS NULL THEN RETURN NEW; END IF;', $insert$
  IF v_booking.id IS NULL THEN RETURN NEW; END IF;
  -- Imported hotel transport billing guard: keep the original hotel charge authoritative.
  IF v_booking.link_kind IN ('hotel_transport_pickup','hotel_transport_dropoff') AND EXISTS (
   SELECT 1 FROM public.import_source_evidence e WHERE e.booking_id=v_booking.parent_booking_id AND e.tenant_id=v_booking.tenant_id AND e.batch='hotel-sheet-2026-11-22'
  ) THEN RETURN NEW; END IF;
  $insert$);
  EXECUTE d;
 END IF;
 SELECT pg_get_functiondef('public.ensure_booking_invoice(uuid)'::regprocedure) INTO d;
 IF strpos(d,'Imported hotel transport invoice guard')=0 THEN
  IF strpos(d,'IF b.invoice_id IS NOT NULL THEN RETURN b.invoice_id; END IF;')=0 THEN RAISE EXCEPTION 'Invoice guard anchor missing'; END IF;
  d:=replace(d,'IF b.invoice_id IS NOT NULL THEN RETURN b.invoice_id; END IF;', $insert$
  IF b.invoice_id IS NOT NULL THEN RETURN b.invoice_id; END IF;
  -- Imported hotel transport invoice guard: quote-only trips are not separate sales.
  IF b.service_type='pickup_dropoff' AND b.link_kind IN ('hotel_transport_pickup','hotel_transport_dropoff') AND EXISTS (
   SELECT 1 FROM public.import_source_evidence e WHERE e.booking_id=b.parent_booking_id AND e.tenant_id=b.tenant_id AND e.batch='hotel-sheet-2026-11-22'
  ) THEN RETURN NULL; END IF;
  $insert$);
  EXECUTE d;
 END IF;
 SELECT pg_get_functiondef('public.sync_hotel_transport_legs(uuid)'::regprocedure) INTO d;
 IF strpos(d,'Preserve imported transport review slots')=0 THEN
  IF strpos(d,'IF v_leg IS NULL THEN')=0 THEN RAISE EXCEPTION 'Transport sync anchor missing'; END IF;
  d:=replace(d,'IF v_leg IS NULL THEN', $insert$
  -- Preserve imported transport review slots on same-day hotel saves.
  IF v_leg IS NOT NULL AND EXISTS(SELECT 1 FROM public.bookings WHERE id=v_leg AND notes_internal LIKE '%Imported hotel transport: hotel-sheet-2026-11-22%') THEN
   SELECT CASE WHEN (start_at AT TIME ZONE 'Africa/Johannesburg')::date=v_day THEN start_at ELSE v_start END,
          CASE WHEN status='requested' THEN status ELSE v_status END
    INTO v_start,v_status FROM public.bookings WHERE id=v_leg;
  END IF;
  IF v_leg IS NULL THEN
  $insert$);
  EXECUTE d;
 END IF;
END $guard$;

CREATE TEMP TABLE hotel_transport_snapshot ON COMMIT DROP AS
 SELECT 'invoices' kind,md5(coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.id)::text,'[]')) digest FROM public.invoices x WHERE tenant_id='75cc6a9e-9d17-4268-92ee-8b595c842dee'
 UNION ALL SELECT 'invoice_items',md5(coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.id)::text,'[]')) FROM public.invoice_items x WHERE tenant_id='75cc6a9e-9d17-4268-92ee-8b595c842dee'
 UNION ALL SELECT 'estimates',md5(coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.id)::text,'[]')) FROM public.estimates x WHERE tenant_id='75cc6a9e-9d17-4268-92ee-8b595c842dee'
 UNION ALL SELECT 'payments',md5(coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.id)::text,'[]')) FROM public.payments x WHERE tenant_id='75cc6a9e-9d17-4268-92ee-8b595c842dee'
 UNION ALL SELECT 'notification_events',md5(coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.id)::text,'[]')) FROM public.notification_events x WHERE tenant_id='75cc6a9e-9d17-4268-92ee-8b595c842dee'
 UNION ALL SELECT 'xero_sync_queue',md5(coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.id)::text,'[]')) FROM public.xero_sync_queue x WHERE tenant_id='75cc6a9e-9d17-4268-92ee-8b595c842dee';

DO $backfill$
DECLARE t uuid:='75cc6a9e-9d17-4268-92ee-8b595c842dee'; v uuid; r record; b public.bookings; a public.customer_addresses; s public.transport_workflow_settings; trip uuid; st timestamptz; mode "char"; current_digest text; snap record; note text;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtext('hotel-transport-import-2026-11-22'));
 SELECT * INTO s FROM public.transport_workflow_settings WHERE tenant_id=t;
 SELECT id INTO v FROM public.resources WHERE tenant_id=t AND type='transport_vehicle' AND active ORDER BY sort_order,name LIMIT 1;
 IF v IS NULL THEN RAISE EXCEPTION 'No active transport vehicle'; END IF;
 SELECT tgenabled INTO mode FROM pg_trigger WHERE tgrelid='public.bookings'::regclass AND tgname='bookings_notify_changes_trg';
 IF mode IS DISTINCT FROM 'O' THEN RAISE EXCEPTION 'Unexpected notification trigger mode'; END IF;
 ALTER TABLE public.bookings DISABLE TRIGGER bookings_notify_changes_trg;
 ALTER TABLE public.bookings DISABLE TRIGGER trg_hotel_booking_transport_sync;
 ALTER TABLE public.hotel_booking_details DISABLE TRIGGER trg_hotel_details_transport_sync;
 FOR r IN SELECT * FROM (VALUES
  ('ad0ee58c-af7c-5a3e-8234-518d676f5350'::uuid,'pickup','2026-11-20'::date,'15:30'::time,true,false,'Pickup recorded retrospectively from the hotel spreadsheet: Friday 20 Nov between 15:30 and 16:00; hotel guest already checked in.'),
  ('ad0ee58c-af7c-5a3e-8234-518d676f5350'::uuid,'dropoff','2026-11-23'::date,'16:00'::time,false,false,'Return Monday afternoon after BOTH pets finish grooming. Provisional 16:00 slot; confirm with customer.'),
  ('87fd0548-66f5-533a-8c50-541653cdef66'::uuid,'pickup','2026-12-03'::date,'09:00'::time,false,false,'Pickup 3 December. QU-4632 / INV-66328; time provisional, confirm with customer.'),
  ('87fd0548-66f5-533a-8c50-541653cdef66'::uuid,'dropoff','2026-12-11'::date,'16:00'::time,false,false,'Return 11 December after BOTH pets finish grooming. QU-4632 / INV-66328; time provisional.'),
  ('394431a5-c724-5c51-ae2f-703ffbac752a'::uuid,'pickup','2026-12-12'::date,'10:00'::time,false,true,'Pickup 12 December at 10:00 as specified on QU-4518. Three dogs and TWO CATS: secure cat carriers required. Owner collects on 24 December; no return trip. Address confirmation required before dispatch.'),
  ('7f7dc8e1-5efc-5915-b2b7-7ebc2b907039'::uuid,'pickup','2026-12-17'::date,'09:00'::time,false,false,'Pickup 17 December: Deauville Estate, Hyperion Drive, North Riding. QU-4583 / INV-65609; time provisional. Owner collects on 22 December; no return trip.'),
  ('1bb8409f-eb73-5f25-bf35-0ea3c2f0d4c9'::uuid,'pickup','2026-12-17'::date,'09:45'::time,false,false,'Pickup 17 December in lieu of daycare pickup on the 16 December public holiday. Original trip is 100% discounted on QU-4797 / INV-68127. Provisional 09:45 slot after the earlier collection.'),
  ('1bb8409f-eb73-5f25-bf35-0ea3c2f0d4c9'::uuid,'dropoff','2026-12-31'::date,'12:00'::time,false,false,'Return 31 December BEFORE 13:00 (business closes at 13:00), in lieu of daycare dropoff on 30 December. Original trip is 100% discounted on QU-4797 / INV-68127. Provisional 12:00 slot; confirm route.'),
  ('a3429667-547f-5bb3-9c6c-f39bd7ee6521'::uuid,'pickup','2026-12-29'::date,'09:00'::time,false,true,'Pickup 29 December from the current hotel spreadsheet. QU-3389 / INV-67302 also contain older vet/Horse & Hound travel references: do not treat those old destinations as this trip. Address confirmation required before dispatch; time provisional.'),
  ('a3429667-547f-5bb3-9c6c-f39bd7ee6521'::uuid,'dropoff','2027-01-05'::date,'16:00'::time,false,true,'Return 5 January from the current hotel spreadsheet (16:00-16:30 checkout). Address confirmation required before dispatch; confirm destination rather than using old travel references.')
 ) x(parent_id,direction,day,local_time,completed,address_pending,instructions) ORDER BY day,local_time
 LOOP
  SELECT * INTO b FROM public.bookings WHERE id=r.parent_id AND tenant_id=t;
  IF b.id IS NULL OR NOT EXISTS(SELECT 1 FROM public.import_source_evidence WHERE booking_id=b.id AND tenant_id=t AND batch='hotel-sheet-2026-11-22') THEN RAISE EXCEPTION 'Unverified hotel stay %',r.parent_id; END IF;
  IF EXISTS(SELECT 1 FROM public.bookings WHERE parent_booking_id=b.id AND service_type='pickup_dropoff' AND link_kind='hotel_transport_'||r.direction) THEN CONTINUE; END IF;
  a:=NULL;
  IF NOT r.address_pending THEN
   SELECT * INTO a FROM public.customer_addresses WHERE tenant_id=t AND customer_id=b.customer_id ORDER BY is_primary DESC,created_at LIMIT 1;
  END IF;
  st:=(r.day+r.local_time) AT TIME ZONE 'Africa/Johannesburg';
  IF EXISTS(SELECT 1 FROM public.bookings WHERE tenant_id=t AND resource_id=v AND status NOT IN ('cancelled','no_show') AND start_at<st+interval '30 minutes' AND coalesce(end_at,start_at+interval '30 minutes')>st) THEN RAISE EXCEPTION 'Transport vehicle overlap at %',st; END IF;
  note:='Imported hotel transport: hotel-sheet-2026-11-22'||E'\n'||'Hotel stay '||b.booking_number||E'\n'||r.instructions||E'\n'||'Original hotel quote/invoice remains the billing source; do not charge transport again. Staff to confirm route, access/gate details and provisional times.';
  INSERT INTO public.bookings(tenant_id,customer_id,booking_number,service_type,source,status,start_at,end_at,start_date,end_date,resource_id,parent_booking_id,link_kind,invoice_id,deposit_waived,suppress_initial_emails,service_address_id,service_address_text,service_place_id,service_suburb,notes_internal)
  VALUES(t,b.customer_id,public.next_booking_number(t),'pickup_dropoff','staff_capture',CASE WHEN r.completed THEN 'completed'::public.booking_status ELSE 'requested'::public.booking_status END,st,st+interval '30 minutes',r.day,r.day,v,b.id,'hotel_transport_'||r.direction,b.invoice_id,true,true,a.id,coalesce(a.formatted_address,a.address_line_1),a.google_place_id,a.suburb,note) RETURNING id INTO trip;
  INSERT INTO public.booking_pets(tenant_id,booking_id,pet_id) SELECT t,trip,pet_id FROM public.booking_pets WHERE booking_id=b.id;
  INSERT INTO public.transport_details(tenant_id,booking_id,direction,pickup_address,dropoff_address,suburb,gate_code,pickup_address_id,pickup_place_id,dropoff_address_id,dropoff_place_id,planned_window_start,planned_window_end,driver_notes)
  VALUES(t,trip,r.direction,CASE WHEN r.direction='pickup' THEN coalesce(a.formatted_address,a.address_line_1) ELSE s.base_address END,CASE WHEN r.direction='dropoff' THEN coalesce(a.formatted_address,a.address_line_1) ELSE s.base_address END,a.suburb,a.gate_code,CASE WHEN r.direction='pickup' THEN a.id END,CASE WHEN r.direction='pickup' THEN a.google_place_id ELSE s.base_place_id END,CASE WHEN r.direction='dropoff' THEN a.id END,CASE WHEN r.direction='dropoff' THEN a.google_place_id ELSE s.base_place_id END,st,st+interval '30 minutes',note);
 END LOOP;
 UPDATE public.hotel_booking_details SET pickup_required=true,dropoff_required=booking_id NOT IN ('394431a5-c724-5c51-ae2f-703ffbac752a'::uuid,'7f7dc8e1-5efc-5915-b2b7-7ebc2b907039'::uuid) WHERE tenant_id=t AND booking_id IN ('ad0ee58c-af7c-5a3e-8234-518d676f5350','87fd0548-66f5-533a-8c50-541653cdef66','394431a5-c724-5c51-ae2f-703ffbac752a','7f7dc8e1-5efc-5915-b2b7-7ebc2b907039','1bb8409f-eb73-5f25-bf35-0ea3c2f0d4c9','a3429667-547f-5bb3-9c6c-f39bd7ee6521');
 UPDATE public.bookings SET requires_transport=true WHERE tenant_id=t AND id IN ('ad0ee58c-af7c-5a3e-8234-518d676f5350','87fd0548-66f5-533a-8c50-541653cdef66','394431a5-c724-5c51-ae2f-703ffbac752a','7f7dc8e1-5efc-5915-b2b7-7ebc2b907039','1bb8409f-eb73-5f25-bf35-0ea3c2f0d4c9','a3429667-547f-5bb3-9c6c-f39bd7ee6521');
 ALTER TABLE public.bookings ENABLE TRIGGER bookings_notify_changes_trg;
 ALTER TABLE public.bookings ENABLE TRIGGER trg_hotel_booking_transport_sync;
 ALTER TABLE public.hotel_booking_details ENABLE TRIGGER trg_hotel_details_transport_sync;
 FOR snap IN SELECT * FROM hotel_transport_snapshot LOOP
  EXECUTE format('SELECT md5(coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.id)::text,''[]'')) FROM public.%I x WHERE tenant_id=$1',snap.kind) INTO current_digest USING t;
  IF current_digest IS DISTINCT FROM snap.digest THEN RAISE EXCEPTION 'Import altered %',snap.kind; END IF;
 END LOOP;
 IF (SELECT count(*) FROM public.bookings WHERE tenant_id=t AND notes_internal LIKE '%Imported hotel transport: hotel-sheet-2026-11-22%')<>10 THEN RAISE EXCEPTION 'Expected ten imported trips'; END IF;
 IF (SELECT sync_payments FROM public.xero_settings WHERE tenant_id=t) IS DISTINCT FROM false THEN RAISE EXCEPTION 'Xero payment sync must stay disabled'; END IF;
 RAISE NOTICE 'Ten transport legs captured with financial records and customer queues unchanged';
END $backfill$;