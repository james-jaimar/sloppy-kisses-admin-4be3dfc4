CREATE TABLE public.import_source_evidence (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL,
 booking_id uuid NOT NULL,
 batch text NOT NULL,
 evidence jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE (tenant_id, batch, booking_id)
);
GRANT ALL ON public.import_source_evidence TO service_role;
REVOKE ALL ON public.import_source_evidence FROM anon, authenticated;
ALTER TABLE public.import_source_evidence ENABLE ROW LEVEL SECURITY;
-- Intentionally no client policies: original import evidence is service-role-only.
CREATE TRIGGER import_source_evidence_updated_at BEFORE UPDATE ON public.import_source_evidence FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
COMMENT ON TABLE public.import_source_evidence IS 'Private original import evidence; never exposed by customer or staff presentation endpoints.';

CREATE FUNCTION pg_temp.hotel_import_readable_notes(original text) RETURNS text LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $$
 SELECT nullif(btrim(string_agg(line, E'\n' ORDER BY ord)), '')
 FROM regexp_split_to_table(coalesce(original,''), E'\n') WITH ORDINALITY AS s(line,ord)
 WHERE btrim(line)<>''
 AND line !~ '^\[hotel-sheet-2026-11-22:row:[0-9]+\]$'
 AND line !~ '^Row [0-9]+: \['
 AND line !~ '^Existing invoice found through Xero quote/customer lookup:'
 AND line !~ '^Spreadsheet January year corrected to 2027; confirmed by Xero invoice dates\.';
$$;

DO $$
DECLARE
 t uuid := '75cc6a9e-9d17-4268-92ee-8b595c842dee';
 b record; a record; q jsonb; i jsonb; r jsonb; raw_rows jsonb; sheet_notes text; desk_notes text;
 before_notifications bigint; before_queue bigint; before_payments text;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('hotel-sheet-2026-11-22',0));
 SELECT count(*) INTO before_notifications FROM public.notification_events WHERE tenant_id=t;
 SELECT count(*) INTO before_queue FROM public.xero_sync_queue WHERE tenant_id=t;
 SELECT md5(coalesce(jsonb_agg(to_jsonb(p) ORDER BY p.id)::text,'[]')) INTO before_payments FROM public.payments p WHERE tenant_id=t;
 IF (SELECT count(*) FROM public.bookings WHERE tenant_id=t AND notes_internal LIKE '%[hotel-sheet-2026-11-22:row:%')<>123 THEN
   RAISE EXCEPTION 'Expected all 123 imported stays before cleanup';
 END IF;
 FOR b IN SELECT * FROM public.bookings WHERE tenant_id=t AND notes_internal LIKE '%[hotel-sheet-2026-11-22:row:%' FOR UPDATE LOOP
   SELECT coalesce(jsonb_agg(jsonb_build_object('row_number',m[1]::integer,'values',m[2]::jsonb)),'[]'::jsonb) INTO raw_rows
   FROM regexp_matches(b.notes_internal,'(?n)^Row ([0-9]+): (\[.*\])$','g') m;
   IF jsonb_array_length(raw_rows)=0 THEN RAISE EXCEPTION 'Missing source rows for %',b.id; END IF;
   SELECT coalesce(jsonb_agg(to_jsonb(e) ORDER BY e.id),'[]'::jsonb) INTO q FROM public.estimates e WHERE e.tenant_id=t AND e.booking_id=b.id AND e.created_via='hotel_sheet_import';
   SELECT coalesce(jsonb_agg(to_jsonb(inv) ORDER BY inv.id),'[]'::jsonb) INTO i FROM public.invoices inv WHERE inv.tenant_id=t AND inv.booking_id=b.id AND EXISTS(SELECT 1 FROM public.invoice_items li WHERE li.invoice_id=inv.id AND li.source_type='legacy_xero_hotel');
   SELECT to_jsonb(h) INTO r FROM public.hotel_booking_details h WHERE h.tenant_id=t AND h.booking_id=b.id;
   INSERT INTO public.import_source_evidence(tenant_id,booking_id,batch,evidence)
   VALUES(t,b.id,'hotel-sheet-2026-11-22',jsonb_build_object('raw_sheet_rows',raw_rows,'original_booking',to_jsonb(b),'original_hotel_details',r,'original_estimates',q,'original_invoices',i));
 END LOOP;
 -- Original notes and parsed source rows are archived before any visible field is changed.
 FOR a IN SELECT * FROM public.import_source_evidence WHERE tenant_id=t AND batch='hotel-sheet-2026-11-22' LOOP
   SELECT string_agg(note,E'\n' ORDER BY note) INTO sheet_notes FROM (
     SELECT DISTINCT btrim(value->'values'->>14) AS note FROM jsonb_array_elements(a.evidence->'raw_sheet_rows')
   ) n WHERE note IS NOT NULL AND note<>'' AND note !~* '^Add (into|to) ';
   desk_notes:=pg_temp.hotel_import_readable_notes(a.evidence->'original_booking'->>'notes_internal');
   IF sheet_notes IS NOT NULL AND position(lower(sheet_notes) in lower(coalesce(desk_notes,'')))=0 THEN
     desk_notes:=concat_ws(E'\n',desk_notes,sheet_notes);
   END IF;
   UPDATE public.bookings SET notes_internal=nullif(desk_notes,'') WHERE id=a.booking_id AND tenant_id=t;
   UPDATE public.hotel_booking_details SET additional_notes=nullif(concat_ws(E'\n',
     pg_temp.hotel_import_readable_notes(a.evidence->'original_hotel_details'->>'additional_notes'),
     CASE WHEN sheet_notes IS NOT NULL AND position(lower(sheet_notes) in lower(coalesce(a.evidence->'original_hotel_details'->>'additional_notes','')))=0 THEN sheet_notes
          WHEN sheet_notes IS NOT NULL THEN sheet_notes END),'') WHERE booking_id=a.booking_id AND tenant_id=t;
   UPDATE public.estimates SET notes=NULL WHERE booking_id=a.booking_id AND tenant_id=t AND created_via='hotel_sheet_import';
   UPDATE public.invoices SET notes='Imported from Xero '||coalesce(xero_invoice_number,invoice_number)||'; not reissued.'
   WHERE booking_id=a.booking_id AND tenant_id=t AND id IN (SELECT (value->>'id')::uuid FROM jsonb_array_elements(a.evidence->'original_invoices'));
   IF EXISTS(SELECT 1 FROM public.bookings current_b WHERE current_b.id=a.booking_id AND
     (to_jsonb(current_b)-ARRAY['notes_internal','updated_at','updated_by']) IS DISTINCT FROM ((a.evidence->'original_booking')-ARRAY['notes_internal','updated_at','updated_by'])) THEN
     RAISE EXCEPTION 'Booking fields changed beyond notes for %',a.booking_id;
   END IF;
   IF EXISTS(SELECT 1 FROM public.hotel_booking_details h WHERE h.booking_id=a.booking_id AND
     (to_jsonb(h)-ARRAY['additional_notes','updated_at']) IS DISTINCT FROM ((a.evidence->'original_hotel_details')-ARRAY['additional_notes','updated_at'])) THEN
     RAISE EXCEPTION 'Hotel intake fields changed beyond notes for %',a.booking_id;
   END IF;
   IF EXISTS(SELECT 1 FROM jsonb_array_elements(a.evidence->'original_estimates') saved JOIN public.estimates e ON e.id=(saved->>'id')::uuid
      WHERE (to_jsonb(e)-ARRAY['notes','updated_at','updated_by']) IS DISTINCT FROM (saved-ARRAY['notes','updated_at','updated_by'])) THEN
      RAISE EXCEPTION 'Quote fields changed beyond notes for %',a.booking_id;
   END IF;
   IF EXISTS(SELECT 1 FROM jsonb_array_elements(a.evidence->'original_invoices') saved JOIN public.invoices inv ON inv.id=(saved->>'id')::uuid
      WHERE (to_jsonb(inv)-ARRAY['notes','updated_at','updated_by']) IS DISTINCT FROM (saved-ARRAY['notes','updated_at','updated_by'])) THEN
      RAISE EXCEPTION 'Invoice fields changed beyond notes for %',a.booking_id;
   END IF;
 END LOOP;
 IF before_notifications<>(SELECT count(*) FROM public.notification_events WHERE tenant_id=t) OR before_queue<>(SELECT count(*) FROM public.xero_sync_queue WHERE tenant_id=t) THEN
   RAISE EXCEPTION 'Note cleanup unexpectedly queued a message or Xero write';
 END IF;
 IF before_payments IS DISTINCT FROM (SELECT md5(coalesce(jsonb_agg(to_jsonb(p) ORDER BY p.id)::text,'[]')) FROM public.payments p WHERE tenant_id=t) THEN
   RAISE EXCEPTION 'Note cleanup changed payment records';
 END IF;
END $$;
DROP FUNCTION pg_temp.hotel_import_readable_notes(text);