-- Keep imported, already-billed quote grooms from generating a second bill on later edits.
DO $patch$
DECLARE d text;
BEGIN
 SELECT pg_get_functiondef('public.ensure_booking_invoice(uuid)'::regprocedure) INTO d;
 IF strpos(d,'IF b.invoice_id IS NOT NULL THEN RETURN b.invoice_id; END IF;')=0 THEN RAISE EXCEPTION 'Invoice guard anchor missing'; END IF;
 IF strpos(d,'Imported hotel groom billing guard')=0 THEN
 d:=replace(d,'IF b.invoice_id IS NOT NULL THEN RETURN b.invoice_id; END IF;', $guard$
 IF b.invoice_id IS NOT NULL THEN RETURN b.invoice_id; END IF;
 -- Imported hotel groom billing guard: a quoted/billed groom is not a new sale.
 IF b.service_type='grooming_inhouse' AND b.parent_booking_id IS NOT NULL AND EXISTS (
  SELECT 1 FROM public.estimates e WHERE e.booking_id=b.parent_booking_id AND e.tenant_id=b.tenant_id AND e.created_via='hotel_sheet_import'
   AND (EXISTS(SELECT 1 FROM public.booking_pets bp WHERE bp.booking_id=b.id AND (e.extras->'legacy_hotel_import'->'billed_groom_pet_ids') ? bp.pet_id::text)
    OR EXISTS(SELECT 1 FROM jsonb_array_elements(coalesce(nullif(e.extras->'legacy_hotel_import'->'source_invoice','null'::jsonb),e.extras->'legacy_hotel_import'->'source_quote')->'LineItems') li WHERE coalesce(li->>'ItemCode','') ~* '^(DG|CG)'))
 ) THEN RETURN NULL; END IF;
 $guard$);
 EXECUTE d;
 END IF;
END $patch$;

-- One-off, transaction-scoped backfill. No client endpoint or permission changes.
CREATE TEMP TABLE hotel_followup_financial_snapshot AS
 SELECT 'invoices' AS kind,md5(coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.id)::text,'[]')) AS digest FROM public.invoices x WHERE tenant_id='75cc6a9e-9d17-4268-92ee-8b595c842dee'
 UNION ALL SELECT 'invoice_items',md5(coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.id)::text,'[]')) FROM public.invoice_items x WHERE tenant_id='75cc6a9e-9d17-4268-92ee-8b595c842dee'
 UNION ALL SELECT 'estimates',md5(coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.id)::text,'[]')) FROM public.estimates x WHERE tenant_id='75cc6a9e-9d17-4268-92ee-8b595c842dee'
 UNION ALL SELECT 'payments',md5(coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.id)::text,'[]')) FROM public.payments x WHERE tenant_id='75cc6a9e-9d17-4268-92ee-8b595c842dee';

DO $backfill$
DECLARE
 t uuid:='75cc6a9e-9d17-4268-92ee-8b595c842dee'; r record; station record; s record;
 original_auto boolean; notification_count bigint; queue_count bigint; trigger_mode "char";
 target_day date; earliest date; target_days date[]; slot_start timestamptz; slot_end timestamptz;
 chosen_resource uuid; chosen_start timestamptz; chosen_end timestamptz; bid uuid; linked_invoice uuid;
 billed boolean; added integer:=0; held integer:=0; sessions_before integer; sessions_after integer; snapshot record; digest text;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('hotel-sheet-2026-11-22-followup',0));
 IF EXISTS(SELECT 1 FROM public.xero_settings WHERE tenant_id=t AND sync_payments IS TRUE) THEN RAISE EXCEPTION 'Xero payment sync must stay off'; END IF;
 SELECT count(*) INTO notification_count FROM public.notification_events WHERE tenant_id=t;
 SELECT count(*) INTO queue_count FROM public.xero_sync_queue WHERE tenant_id=t;
 SELECT auto_invoice_grooming INTO original_auto FROM public.invoicing_settings WHERE tenant_id=t FOR UPDATE;
 SELECT tgenabled INTO trigger_mode FROM pg_trigger WHERE tgrelid='public.bookings'::regclass AND tgname='bookings_notify_changes_trg';
 IF trigger_mode<>'O' THEN RAISE EXCEPTION 'Unexpected notification trigger state'; END IF;
 ALTER TABLE public.bookings DISABLE TRIGGER bookings_notify_changes_trg;
 UPDATE public.invoicing_settings SET auto_invoice_grooming=false WHERE tenant_id=t;
 SELECT count(*) INTO sessions_before FROM public.stay_play_sessions WHERE tenant_id=t;
 INSERT INTO public.stay_play_sessions(tenant_id,booking_id,pet_id,customer_id,session_date,origin,expected_collect_at)
 SELECT t,b.id,p.id,b.customer_id,(b.end_at AT TIME ZONE 'Africa/Johannesburg')::date,'hotel',
  (((b.end_at AT TIME ZONE 'Africa/Johannesburg')::date + '16:30'::time) AT TIME ZONE 'Africa/Johannesburg')
 FROM public.import_source_evidence e JOIN public.bookings b ON b.id=e.booking_id AND b.tenant_id=e.tenant_id
 JOIN public.booking_pets bp ON bp.booking_id=b.id AND bp.tenant_id=t JOIN public.pets p ON p.id=bp.pet_id AND p.tenant_id=t
 WHERE e.tenant_id=t AND e.batch='hotel-sheet-2026-11-22' AND p.species='dog'
 AND b.status NOT IN ('cancelled','no_show') AND (b.end_at AT TIME ZONE 'Africa/Johannesburg')::time >= '16:00'
 AND EXISTS(SELECT 1 FROM jsonb_array_elements(e.evidence->'raw_sheet_rows') row WHERE row->'values'->>6 LIKE '16:00%')
 ON CONFLICT(booking_id,pet_id) DO NOTHING;
 SELECT count(*) INTO sessions_after FROM public.stay_play_sessions WHERE tenant_id=t;

 FOR r IN
 SELECT g.*,b.booking_number AS hotel_number,b.end_at,b.invoice_id AS hotel_invoice_id,b.start_date AS hotel_start
 FROM public.hotel_grooming_requests g JOIN public.import_source_evidence e ON e.booking_id=g.hotel_booking_id AND e.tenant_id=g.tenant_id
 JOIN public.bookings b ON b.id=g.hotel_booking_id AND b.tenant_id=t
 WHERE g.tenant_id=t AND e.batch='hotel-sheet-2026-11-22' AND g.status='pending' AND g.grooming_booking_id IS NULL AND b.status NOT IN ('cancelled','no_show')
 ORDER BY b.end_at,g.id FOR UPDATE OF g
 LOOP
  IF r.pet_id IS NULL OR NOT EXISTS(SELECT 1 FROM public.pets p WHERE p.id=r.pet_id AND p.tenant_id=t AND p.customer_id=r.customer_id) THEN RAISE EXCEPTION 'Unlinked grooming pet'; END IF;
  -- Do not manufacture past appointments; retain Chance's past Saturday request for review.
  IF (r.end_at AT TIME ZONE 'Africa/Johannesburg')::date <= '2026-11-22'::date THEN held:=held+1; CONTINUE; END IF;
  target_days:=ARRAY[(r.end_at AT TIME ZONE 'Africa/Johannesburg')::date];
  IF r.id='684120b9-df71-5a04-8a80-e755bf6cfa7b' AND r.customer_notes LIKE '%5 dec and 5 Jan%' THEN target_days:=ARRAY['2026-12-05'::date,'2027-01-05'::date]; END IF;
  SELECT EXISTS(SELECT 1 FROM public.estimates e WHERE e.booking_id=r.hotel_booking_id AND e.tenant_id=t AND e.created_via='hotel_sheet_import' AND (e.extras->'legacy_hotel_import'->'billed_groom_pet_ids') ? r.pet_id::text) INTO billed;
  linked_invoice:=CASE WHEN billed THEN r.hotel_invoice_id ELSE NULL END;
  FOREACH target_day IN ARRAY target_days LOOP
   earliest:=greatest(coalesce(r.window_start,r.hotel_start),'2026-11-23'::date);
   chosen_resource:=NULL; chosen_start:=NULL;
   WHILE target_day>=earliest LOOP
    IF extract(isodow FROM target_day)<>7 AND NOT EXISTS(SELECT 1 FROM public.closures c WHERE c.tenant_id=t AND target_day BETWEEN c.start_date AND c.end_date AND (cardinality(c.services)=0 OR 'grooming'=ANY(c.services))) THEN
     -- Earliest one-hour slot, then first station in diary order. Never run past collection.
     FOR s IN SELECT value AS time_value FROM generate_series((target_day+'08:00'::time) AT TIME ZONE 'Africa/Johannesburg',(target_day+'16:00'::time) AT TIME ZONE 'Africa/Johannesburg',interval '30 minutes') value LOOP
      slot_start:=s.time_value; slot_end:=slot_start+interval '60 minutes';
      IF slot_end>r.end_at THEN CONTINUE; END IF;
      FOR station IN SELECT * FROM public.resources WHERE tenant_id=t AND active AND type='inhouse_grooming' ORDER BY sort_order,name,id LOOP
       IF (slot_start AT TIME ZONE 'Africa/Johannesburg')::time<coalesce(station.workday_start,'08:00'::time) OR (slot_end AT TIME ZONE 'Africa/Johannesburg')::time>coalesce(station.workday_end,'17:00'::time) THEN CONTINUE; END IF;
       IF NOT EXISTS(SELECT 1 FROM public.bookings b WHERE b.tenant_id=t AND b.resource_id=station.id AND b.status NOT IN ('cancelled','no_show','completed','checked_out') AND b.start_at<slot_end AND b.end_at>slot_start) THEN
        chosen_resource:=station.id; chosen_start:=slot_start; chosen_end:=slot_end; EXIT;
       END IF;
      END LOOP;
      EXIT WHEN chosen_resource IS NOT NULL;
     END LOOP;
    END IF;
    EXIT WHEN chosen_resource IS NOT NULL;
    target_day:=target_day-1;
   END LOOP;
   IF chosen_resource IS NULL THEN RAISE EXCEPTION 'No valid slot for imported request %; refusing partial import',r.id; END IF;
   INSERT INTO public.bookings(tenant_id,customer_id,booking_number,service_type,source,status,start_at,end_at,start_date,end_date,resource_id,parent_booking_id,invoice_id,notes_internal,suppress_initial_emails)
   VALUES(t,r.customer_id,public.next_booking_number(t),'grooming_inhouse','staff_capture','requested',chosen_start,chosen_end,target_day,target_day,chosen_resource,r.hotel_booking_id,linked_invoice,
    'Hotel guest groom — stay '||r.hotel_number||E'\nProvisional import slot: staff to confirm time, package and instructions.\n'||coalesce(r.customer_notes,'')||E'\nImported hotel groom request: '||r.id::text,true) RETURNING id INTO bid;
   INSERT INTO public.booking_pets(tenant_id,booking_id,pet_id) VALUES(t,bid,r.pet_id);
   INSERT INTO public.grooming_booking_details(tenant_id,booking_id,grooming_mode,duration_minutes,service_package,grooming_notes)
   VALUES(t,bid,'inhouse',60,CASE WHEN r.customer_notes ILIKE '%Express%' THEN 'Express — confirm package' WHEN r.customer_notes ILIKE '%Full Package%' THEN 'Full Package — confirm package' ELSE 'Hotel groom — confirm package' END,
    coalesce(r.customer_notes,'')||E'\nProvisional one-hour slot; confirm package, instructions and existing hotel billing before any new charge.');
   UPDATE public.hotel_grooming_requests SET status='scheduled',grooming_booking_id=bid,scheduled_at=now() WHERE id=r.id AND tenant_id=t;
   added:=added+1;
  END LOOP;
 END LOOP;
 UPDATE public.invoicing_settings SET auto_invoice_grooming=original_auto WHERE tenant_id=t;
 ALTER TABLE public.bookings ENABLE TRIGGER bookings_notify_changes_trg;
 IF (SELECT count(*) FROM public.notification_events WHERE tenant_id=t)<>notification_count OR (SELECT count(*) FROM public.xero_sync_queue WHERE tenant_id=t)<>queue_count THEN RAISE EXCEPTION 'Unexpected communications or Xero queue change'; END IF;
 FOR snapshot IN SELECT * FROM hotel_followup_financial_snapshot LOOP
  EXECUTE format('SELECT md5(coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.id)::text,''[]'')) FROM public.%I x WHERE tenant_id=$1',snapshot.kind) INTO digest USING t;
  IF digest<>snapshot.digest THEN RAISE EXCEPTION 'Financial data changed: %',snapshot.kind; END IF;
 END LOOP;
 RAISE NOTICE 'Added % grooming appointments; held % past-date requests; added % dog Stay & Play sessions',added,held,sessions_after-sessions_before;
END $backfill$;
DROP TABLE hotel_followup_financial_snapshot;