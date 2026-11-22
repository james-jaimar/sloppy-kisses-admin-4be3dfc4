CREATE OR REPLACE FUNCTION public.import_hotel_sheet_20261122(p_data jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
 t uuid := '75cc6a9e-9d17-4268-92ee-8b595c842dee';
 c jsonb; p jsonb; r jsonb; l jsonb; g jsonb; s jsonb; pay jsonb; ie jsonb; qe jsonb;
 bid uuid; cid uuid; iid uuid; eid uuid; petid uuid; rid uuid; acc text; num text;
 original_auto boolean; original_push boolean; notifications jsonb; petids uuid[];
 invoice_total numeric; paid_total numeric; inserted integer:=0; skipped integer:=0;
 snapshot jsonb; source_key text; final_status public.booking_status;
BEGIN
 IF p_data->>'batch'<>'hotel-sheet-2026-11-22' OR (p_data->>'tenant_id')::uuid<>t
    OR jsonb_typeof(p_data->'records')<>'array' OR jsonb_array_length(p_data->'records')>130 THEN
   RAISE EXCEPTION 'Invalid hotel import batch';
 END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('hotel-sheet-2026-11-22',0));
 IF EXISTS(SELECT 1 FROM public.xero_settings WHERE tenant_id=t AND sync_payments IS TRUE) THEN
   RAISE EXCEPTION 'Payment syncing must remain disabled';
 END IF;
 SELECT auto_invoice_hotel INTO original_auto FROM public.invoicing_settings WHERE tenant_id=t FOR UPDATE;
 SELECT auto_push INTO original_push FROM public.xero_settings WHERE tenant_id=t FOR UPDATE;
 UPDATE public.invoicing_settings SET auto_invoice_hotel=false WHERE tenant_id=t;
 UPDATE public.xero_settings SET auto_push=false WHERE tenant_id=t;
 FOR c IN SELECT value FROM jsonb_array_elements(COALESCE(p_data->'customers','[]')) LOOP
   IF NOT EXISTS(SELECT 1 FROM public.customers WHERE id=(c->>'id')::uuid) THEN
     IF EXISTS(SELECT 1 FROM public.customers WHERE tenant_id=t AND
       (customer_number=c->>'customer_number' OR xero_customer_id=c->>'xero_customer_id'
       OR (nullif(c->>'email','') IS NOT NULL AND lower(email)=lower(c->>'email')))) THEN
       RAISE EXCEPTION 'Customer account or email already exists: %',c->>'customer_number';
     END IF;
     INSERT INTO public.customers(id,tenant_id,customer_number,full_name,email,xero_customer_id,notify_email)
       VALUES((c->>'id')::uuid,t,c->>'customer_number',c->>'full_name',nullif(c->>'email',''),c->>'xero_customer_id',true);
   END IF;
 END LOOP;
 SELECT jsonb_agg(jsonb_build_object('id',id,'notify_email',notify_email)) INTO notifications
   FROM public.customers WHERE tenant_id=t AND id IN
      (SELECT (value->>'customer_id')::uuid FROM jsonb_array_elements(p_data->'records'));
 UPDATE public.customers SET notify_email=false WHERE tenant_id=t AND id IN
      (SELECT (value->>'customer_id')::uuid FROM jsonb_array_elements(p_data->'records'));
 FOR p IN SELECT value FROM jsonb_array_elements(COALESCE(p_data->'new_pets','[]')) LOOP
   IF NOT EXISTS(SELECT 1 FROM public.customers WHERE id=(p->>'customer_id')::uuid AND tenant_id=t) THEN RAISE EXCEPTION 'Pet owner not found'; END IF;
   IF NOT EXISTS(SELECT 1 FROM public.pets WHERE id=(p->>'id')::uuid) THEN
     INSERT INTO public.pets(id,tenant_id,customer_id,pet_number,name,species,breed,import_source,import_batch,imported_at)
     VALUES((p->>'id')::uuid,t,(p->>'customer_id')::uuid,public.next_pet_number(t),p->>'name',(p->>'species')::public.pet_species,p->>'breed','Charlotte hotel spreadsheet','hotel-sheet-2026-11-22',now());
   END IF;
 END LOOP;
 FOR p IN SELECT value FROM jsonb_array_elements(COALESCE(p_data->'pet_corrections','[]')) LOOP
   UPDATE public.pets SET species=(p->>'species')::public.pet_species
    WHERE id=(p->>'id')::uuid AND customer_id=(p->>'customer_id')::uuid AND tenant_id=t AND species::text=p->>'old_species' AND species='other';
 END LOOP;
 FOR r IN SELECT value FROM jsonb_array_elements(p_data->'records') LOOP
   bid:=(r->>'id')::uuid; cid:=(r->>'customer_id')::uuid;
   IF EXISTS(SELECT 1 FROM public.bookings WHERE id=bid AND tenant_id=t) THEN skipped:=skipped+1; CONTINUE; END IF;
   IF NOT EXISTS(SELECT 1 FROM public.customers WHERE id=cid AND tenant_id=t) THEN RAISE EXCEPTION 'Booking customer not found'; END IF;
   IF (r->>'end_date')::date<'2026-11-22'::date OR (r->>'end_date')::date<=(r->>'start_date')::date THEN RAISE EXCEPTION 'Invalid active stay dates'; END IF;
   ie:=nullif(r->'invoice','null'::jsonb); qe:=nullif(r->'estimate','null'::jsonb);
   iid:=null; eid:=null;
   IF ie IS NOT NULL THEN iid:=(ie->>'id')::uuid; END IF;
   IF qe IS NOT NULL THEN eid:=(qe->>'id')::uuid; END IF;
   IF EXISTS(SELECT 1 FROM public.invoices WHERE tenant_id=t AND (invoice_number=ie->>'invoice_number' OR xero_invoice_id=ie->>'xero_invoice_id')) THEN RAISE EXCEPTION 'Invoice already imported'; END IF;
   SELECT id INTO rid FROM public.resources WHERE tenant_id=t AND active AND type::text=CASE WHEN r->>'service_type'='hotel_cat' THEN 'cattery_area' ELSE 'hotel_area' END ORDER BY sort_order,name LIMIT 1;
   IF rid IS NULL THEN RAISE EXCEPTION 'Hotel resource missing'; END IF;
   num:=public.next_booking_number(t);
   source_key:='[hotel-sheet-2026-11-22:row:'||(r->>'source_row')||']';
   INSERT INTO public.bookings(id,tenant_id,customer_id,booking_number,service_type,status,source,start_date,end_date,start_at,end_at,resource_id,notes_internal,suppress_initial_emails,requires_grooming)
   VALUES(bid,t,cid,num,(r->>'service_type')::public.service_type,'requested','staff_capture',(r->>'start_date')::date,(r->>'end_date')::date,
     ((r->>'start_date')||' 09:00')::timestamp AT TIME ZONE 'Africa/Johannesburg',
     ((r->>'end_date')||' '||(r->>'checkout_time'))::timestamp AT TIME ZONE 'Africa/Johannesburg',rid,source_key||E'\n'||(r->>'notes'),true,jsonb_array_length(r->'grooming')>0);
   petids:='{}'::uuid[];
   FOR p IN SELECT value FROM jsonb_array_elements(r->'pets') LOOP
     petid:=(p->>'pet_id')::uuid;
     IF NOT EXISTS(SELECT 1 FROM public.pets WHERE id=petid AND customer_id=cid AND tenant_id=t AND species::text=p->>'species') THEN RAISE EXCEPTION 'Hotel pet ownership/species mismatch'; END IF;
     SELECT id INTO rid FROM public.resources WHERE tenant_id=t AND active AND type::text=CASE WHEN p->>'species'='cat' THEN 'cattery_area' ELSE 'hotel_area' END ORDER BY sort_order,name LIMIT 1;
     INSERT INTO public.booking_pets(tenant_id,booking_id,pet_id,accommodation_type,rate_card_id,resource_id,sort_order)
       VALUES(t,bid,petid,nullif(p->>'accommodation_type',''),nullif(p->>'rate_card_id','')::uuid,rid,cardinality(petids));
     petids:=array_append(petids,petid);
   END LOOP;
   acc:=nullif(r->'pets'->0->>'accommodation_type','');
   INSERT INTO public.hotel_booking_details(tenant_id,booking_id,accommodation_type,check_in_window,check_out_window,agreed_collection_time,additional_notes,grooming_required,grooming_instructions)
   VALUES(t,bid,acc,'09:00–11:00',nullif(r->>'check_out_window',''),CASE WHEN nullif(r->>'check_out_window','') IS NOT NULL THEN (r->>'checkout_time')::time END,
      source_key||E'\n'||(r->>'notes'),jsonb_array_length(r->'grooming')>0,
      (SELECT string_agg(value->>'customer_notes',E'\n\n') FROM jsonb_array_elements(r->'grooming')));
   FOR s IN SELECT value FROM jsonb_array_elements(r->'surcharges') LOOP
     IF NOT EXISTS(SELECT 1 FROM public.hotel_surcharges WHERE id=(s->>'surcharge_id')::uuid AND tenant_id=t AND active) THEN RAISE EXCEPTION 'Invalid hotel extra'; END IF;
     INSERT INTO public.hotel_booking_surcharges(tenant_id,booking_id,surcharge_id,quantity,price_override_zar,quantity_basis)
       VALUES(t,bid,(s->>'surcharge_id')::uuid,(s->>'quantity')::numeric,(s->>'price_override_zar')::numeric,'total');
   END LOOP;
   FOR g IN SELECT value FROM jsonb_array_elements(r->'grooming') LOOP
     INSERT INTO public.hotel_grooming_requests(id,tenant_id,hotel_booking_id,customer_id,pet_id,pet_name,window_start,window_end,customer_notes,status)
       VALUES((g->>'id')::uuid,t,bid,cid,(g->>'pet_id')::uuid,g->>'pet_name',(r->>'start_date')::date,(r->>'end_date')::date,g->>'customer_notes','pending');
   END LOOP;
   IF ie IS NOT NULL THEN
     invoice_total:=(ie->>'total')::numeric;
     IF invoice_total<=0 THEN RAISE EXCEPTION 'Cannot import zero-value hotel invoice'; END IF;
     INSERT INTO public.invoices(id,tenant_id,customer_id,booking_id,invoice_number,xero_invoice_id,xero_invoice_number,status,issue_date,due_date,notes,payment_reference)
      VALUES(iid,t,cid,bid,ie->>'invoice_number',ie->>'xero_invoice_id',ie->>'invoice_number','draft',(ie->>'issue_date')::date,(ie->>'due_date')::date,source_key||E'\nExisting Xero invoice; imported, not reissued.\n'||(r->>'notes'),ie->>'reference');
     FOR l IN SELECT value FROM jsonb_array_elements(ie->'items') LOOP
       INSERT INTO public.invoice_items(tenant_id,invoice_id,booking_id,description,quantity,unit_price,discount_pct,line_total,vat_amount,vat_rate,vat_inclusive,item_code,xero_account_code,sort_order,source_type,source_id)
       VALUES(t,iid,bid,l->>'description',(l->>'quantity')::numeric,(l->>'unit_price')::numeric,(l->>'discount_pct')::numeric,(l->>'line_total')::numeric,(l->>'vat_amount')::numeric,(l->>'vat_rate')::numeric,true,l->>'item_code',l->>'xero_account_code',(l->>'sort_order')::int,'legacy_xero_hotel',bid);
     END LOOP;
     IF EXISTS(SELECT 1 FROM public.invoices WHERE id=iid AND abs(total-invoice_total)>0.02) THEN RAISE EXCEPTION 'Imported invoice % total mismatch',ie->>'invoice_number'; END IF;
     -- Xero's original per-line rounded tax and totals remain authoritative.
     UPDATE public.invoices SET subtotal=(ie->>'subtotal')::numeric,total=invoice_total,tax_total=(ie->>'tax_total')::numeric,discount_total=(ie->>'discount_total')::numeric,balance_due=invoice_total,status='issued' WHERE id=iid;
     FOR pay IN SELECT value FROM jsonb_array_elements(r->'payments') LOOP
       INSERT INTO public.payments(id,tenant_id,customer_id,invoice_id,amount,payment_method,payment_reference,paid_at,status,notes,xero_payment_id)
       VALUES((pay->>'id')::uuid,t,cid,iid,(pay->>'amount')::numeric,'other',pay->>'payment_reference',(pay->>'paid_at')::date::timestamp AT TIME ZONE 'Africa/Johannesburg','received',pay->>'notes',nullif(pay->>'xero_payment_id',''));
     END LOOP;
     IF EXISTS(SELECT 1 FROM public.invoices WHERE id=iid AND (abs(amount_paid-(ie->>'amount_paid')::numeric)>0.005 OR abs(balance_due-(ie->>'balance_due')::numeric)>0.005)) THEN RAISE EXCEPTION 'Imported invoice % payment mismatch',ie->>'invoice_number'; END IF;
     UPDATE public.invoices SET status=(ie->>'status')::public.billing_status WHERE id=iid;
   END IF;
   snapshot:=jsonb_build_object('batch','hotel-sheet-2026-11-22','source_row',(r->>'source_row')::int,'start_date',r->>'start_date','end_date',r->>'end_date','pets',r->'pets','warnings',r->'warnings','source_quote',r->'source_quote','source_invoice',r->'source_invoice','billed_groom_pet_ids',(SELECT coalesce(jsonb_agg(value->>'pet_id'),'[]') FROM jsonb_array_elements(r->'grooming') WHERE (value->>'already_billed')::boolean));
   IF qe IS NOT NULL THEN
     INSERT INTO public.estimates(id,tenant_id,customer_id,estimate_number,status,issue_date,expiry_date,subtotal,total,service_type,start_at,end_at,accommodation_type,pet_ids,booking_id,converted_invoice_id,created_via,notes,extras,accepted_at,sent_at)
     VALUES(eid,t,cid,qe->>'estimate_number',(qe->>'status')::public.billing_status,(qe->>'issue_date')::date,(qe->>'expiry_date')::date,(qe->>'total')::numeric,(qe->>'total')::numeric,(r->>'service_type')::public.service_type,
       ((r->>'start_date')||' 09:00')::timestamp AT TIME ZONE 'Africa/Johannesburg',((r->>'end_date')||' '||(r->>'checkout_time'))::timestamp AT TIME ZONE 'Africa/Johannesburg',acc,petids,bid,iid,'hotel_sheet_import',source_key||E'\n'||r->>'notes',jsonb_build_object('legacy_hotel_import',snapshot,'pets',r->'pets','check_in_window','09:00–11:00','check_out_window',r->>'check_out_window','surcharges',r->'surcharges'),CASE WHEN qe->>'status'='accepted' THEN now() END,(qe->>'issue_date')::date::timestamp AT TIME ZONE 'Africa/Johannesburg');
     FOR l IN SELECT value FROM jsonb_array_elements(qe->'items') LOOP
       INSERT INTO public.estimate_items(tenant_id,estimate_id,booking_id,description,quantity,unit_price,line_total,sort_order)
       VALUES(t,eid,bid,l->>'description',(l->>'quantity')::numeric,(l->>'unit_price')::numeric,(l->>'line_total')::numeric,(l->>'sort_order')::int);
     END LOOP;
     IF abs((SELECT coalesce(sum(line_total),0) FROM public.estimate_items WHERE estimate_id=eid)-(qe->>'total')::numeric)>0.005 THEN RAISE EXCEPTION 'Imported quote total mismatch'; END IF;
   END IF;
   INSERT INTO public.hotel_booking_reviews(tenant_id,booking_id,estimate_id,collection_time,confirmed_at)
   VALUES(t,bid,eid,CASE WHEN nullif(r->>'check_out_window','') IS NOT NULL THEN (r->>'checkout_time')::time END,CASE WHEN iid IS NOT NULL THEN now() END)
   ON CONFLICT(booking_id) DO UPDATE SET estimate_id=EXCLUDED.estimate_id,collection_time=EXCLUDED.collection_time,confirmed_at=EXCLUDED.confirmed_at;
   final_status:=(r->>'status')::public.booking_status;
   UPDATE public.bookings SET invoice_id=iid,estimate_id=eid,status=final_status,payment_hold_expires_at=NULL,invoice_review_needed=jsonb_array_length(r->'warnings')>0,invoice_review_reason=CASE WHEN jsonb_array_length(r->'warnings')>0 THEN (SELECT string_agg(value#>>'{}',E'\n') FROM jsonb_array_elements(r->'warnings')) END WHERE id=bid;
   UPDATE public.notification_events SET status='skipped',error='Historical hotel import; no customer message sent' WHERE tenant_id=t AND (booking_id=bid OR (iid IS NOT NULL AND invoice_id=iid)) AND status<>'sent';
   INSERT INTO public.xero_sync_log(tenant_id,entity_type,entity_id,entity_label,action,status,xero_id,error_message)
   VALUES(t,'booking',bid,num,'hotel_sheet_import','success',ie->>'xero_invoice_id','Source row '||(r->>'source_row')||'; existing invoices and receipts preserved; no Xero writes.');
   inserted:=inserted+1;
 END LOOP;
 FOR c IN SELECT value FROM jsonb_array_elements(COALESCE(notifications,'[]')) LOOP
   UPDATE public.customers SET notify_email=(c->>'notify_email')::boolean WHERE tenant_id=t AND id=(c->>'id')::uuid;
 END LOOP;
 UPDATE public.invoicing_settings SET auto_invoice_hotel=original_auto WHERE tenant_id=t;
 UPDATE public.xero_settings SET auto_push=original_push WHERE tenant_id=t;
 RETURN jsonb_build_object('inserted',inserted,'already_imported',skipped,'payment_sync',false);
END $$;
REVOKE ALL ON FUNCTION public.import_hotel_sheet_20261122(jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.import_hotel_sheet_20261122(jsonb) TO service_role;

DO $migration$
DECLARE d text; anchor text;
BEGIN
 SELECT pg_get_functiondef('hotel_private.hotel_review_action(uuid,text,jsonb)'::regprocedure) INTO d;
 anchor:='   INSERT INTO public.estimates(tenant_id,customer_id,estimate_number,status,issue_date,expiry_date,service_type,start_at,end_at,accommodation_type,pet_ids,booking_id,extras,notes)';
 IF strpos(d,anchor)=0 THEN RAISE EXCEPTION 'Hotel quote preservation anchor missing'; END IF;
 d:=replace(d,anchor,$branch$
   IF p_action='approve' AND EXISTS(SELECT 1 FROM public.estimates et WHERE et.id=r.estimate_id AND et.booking_id=b.id AND et.tenant_id=b.tenant_id AND et.created_via='hotel_sheet_import' AND et.extras ? 'legacy_hotel_import') THEN
     IF NOT EXISTS(SELECT 1 FROM public.estimates et WHERE et.id=r.estimate_id AND et.status='accepted') THEN RAISE EXCEPTION 'Customer acceptance of the imported quote is required'; END IF;
     IF EXISTS(SELECT 1 FROM public.estimates et WHERE et.id=r.estimate_id AND ((et.extras->'legacy_hotel_import'->>'start_date')::date<>st OR (et.extras->'legacy_hotel_import'->>'end_date')::date<>en OR et.pet_ids IS DISTINCT FROM ARRAY(SELECT bp.pet_id FROM public.booking_pets bp WHERE bp.booking_id=b.id ORDER BY bp.sort_order,bp.created_at))) THEN RAISE EXCEPTION 'Imported stay changed; review a replacement quote before confirming'; END IF;
     e:=r.estimate_id;
     UPDATE public.hotel_booking_reviews SET approved_at=now(),approved_by=public.current_profile_id() WHERE booking_id=b.id;
     RETURN e;
   END IF;
$branch$||anchor);
 EXECUTE d;
END $migration$;