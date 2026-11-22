DO $tests$
DECLARE t uuid:='75cc6a9e-9d17-4268-92ee-8b595c842dee'; groom record; n integer; before_invoices integer;
BEGIN
 SELECT count(*) INTO n FROM public.bookings WHERE tenant_id=t AND notes_internal LIKE '%Imported hotel groom request:%';
 IF n<>80 THEN RAISE EXCEPTION 'Expected 80 appointments, got %',n; END IF;
 SELECT count(*) INTO n FROM public.hotel_grooming_requests r JOIN public.import_source_evidence e ON e.booking_id=r.hotel_booking_id WHERE e.tenant_id=t AND e.batch='hotel-sheet-2026-11-22' AND r.status='scheduled';
 IF n<>79 THEN RAISE EXCEPTION 'Expected 79 scheduled requests, got %',n; END IF;
 IF EXISTS(SELECT 1 FROM public.bookings b WHERE b.tenant_id=t AND b.notes_internal LIKE '%Imported hotel groom request:%' AND (b.resource_id IS NULL OR b.end_at>(SELECT end_at FROM public.bookings WHERE id=b.parent_booking_id) OR extract(isodow FROM b.start_at AT TIME ZONE 'Africa/Johannesburg')=7)) THEN RAISE EXCEPTION 'Unassigned, Sunday or after-collection groom'; END IF;
 IF EXISTS(SELECT 1 FROM public.bookings a JOIN public.bookings b ON a.resource_id=b.resource_id AND a.id<b.id AND a.start_at<b.end_at AND b.start_at<a.end_at WHERE a.tenant_id=t AND b.tenant_id=t AND a.notes_internal LIKE '%Imported hotel groom request:%' AND b.status NOT IN ('cancelled','no_show','completed','checked_out')) THEN RAISE EXCEPTION 'Station slot overlap'; END IF;
 SELECT count(*) INTO n FROM public.stay_play_sessions WHERE tenant_id=t AND booking_id IN ('69bef9f1-e4d3-54de-9d83-ed56e4fcff2c','b1b1d18d-9440-540d-9fb4-723ed106340f','d45159df-ae10-5955-bbc9-98275dad499a','006bb779-cdec-5747-95b0-90e1d1e30290','af0217ca-9b40-5207-8aed-9c11430215f4');
 IF n<>8 THEN RAISE EXCEPTION 'Expected eight dog sessions across the five missing stays, got %',n; END IF;
 IF EXISTS(SELECT 1 FROM public.stay_play_sessions s JOIN public.pets p ON p.id=s.pet_id WHERE s.booking_id IN ('69bef9f1-e4d3-54de-9d83-ed56e4fcff2c','b1b1d18d-9440-540d-9fb4-723ed106340f','d45159df-ae10-5955-bbc9-98275dad499a','006bb779-cdec-5747-95b0-90e1d1e30290','af0217ca-9b40-5207-8aed-9c11430215f4') AND (p.species<>'dog' OR s.session_date<>(SELECT (end_at AT TIME ZONE 'Africa/Johannesburg')::date FROM public.bookings WHERE id=s.booking_id) OR (s.expected_collect_at AT TIME ZONE 'Africa/Johannesburg')::time<>'16:30'::time)) THEN RAISE EXCEPTION 'Wrong species, departure date or collection time'; END IF;
 SELECT count(*) INTO n FROM public.bookings WHERE tenant_id=t AND notes_internal LIKE '%Imported hotel groom request: 684120b9-df71-5a04-8a80-e755bf6cfa7b%' AND start_date IN ('2026-12-05','2027-01-05');
 IF n<>2 THEN RAISE EXCEPTION 'Tia must have both requested dates'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.hotel_grooming_requests WHERE id='ae75dc6d-9312-5f59-83e7-4ff0d17d31ca' AND status='pending' AND grooming_booking_id IS NULL) THEN RAISE EXCEPTION 'Past Chance groom needs review, not a manufactured appointment'; END IF;
 SELECT count(*) INTO before_invoices FROM public.invoices WHERE tenant_id=t;
 n:=0;
 FOR groom IN SELECT DISTINCT b.id FROM public.bookings b JOIN public.estimates e ON e.booking_id=b.parent_booking_id AND e.tenant_id=b.tenant_id WHERE b.tenant_id=t AND b.invoice_id IS NULL AND b.notes_internal LIKE '%Imported hotel groom request:%' AND e.created_via='hotel_sheet_import' AND (EXISTS(SELECT 1 FROM public.booking_pets bp WHERE bp.booking_id=b.id AND (e.extras->'legacy_hotel_import'->'billed_groom_pet_ids') ? bp.pet_id::text) OR EXISTS(SELECT 1 FROM jsonb_array_elements(coalesce(nullif(e.extras->'legacy_hotel_import'->'source_invoice','null'::jsonb),e.extras->'legacy_hotel_import'->'source_quote')->'LineItems') li WHERE coalesce(li->>'ItemCode','') ~* '^(DG|CG)')) LOOP
  IF public.ensure_booking_invoice(groom.id) IS NOT NULL THEN RAISE EXCEPTION 'Already-quoted groom generated a second invoice'; END IF;
  n:=n+1;
 END LOOP;
 IF n=0 THEN RAISE EXCEPTION 'Invoice guard test must exercise real quoted grooms'; END IF;
 IF (SELECT count(*) FROM public.invoices WHERE tenant_id=t)<>before_invoices THEN RAISE EXCEPTION 'Invoice guard wrote an invoice'; END IF;
 IF (SELECT sync_payments FROM public.xero_settings WHERE tenant_id=t) IS DISTINCT FROM false THEN RAISE EXCEPTION 'Xero payment sync must remain off'; END IF;
 IF (SELECT auto_invoice_grooming FROM public.invoicing_settings WHERE tenant_id=t) IS DISTINCT FROM true THEN RAISE EXCEPTION 'Normal grooming billing was not restored'; END IF;
 RAISE NOTICE 'Hotel follow-up checks passed; tested % quoted-groom invoice guards',n;
END $tests$;