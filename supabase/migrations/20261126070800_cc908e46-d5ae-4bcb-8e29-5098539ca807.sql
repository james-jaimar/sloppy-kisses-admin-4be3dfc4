DO $$
DECLARE i public.invoices; q public.estimates; h public.bookings; g public.bookings; rid uuid;
BEGIN
 SELECT * INTO q FROM public.estimates WHERE id='ddd347cd-30fd-4b3f-a108-3bedde81a528' AND estimate_number='QU-4889' FOR UPDATE;
 SELECT * INTO h FROM public.bookings WHERE id=q.booking_id FOR UPDATE;
 SELECT * INTO g FROM public.bookings WHERE id='fe1864f7-69f2-439e-b213-1401627477ea' AND booking_number='BK00299' FOR UPDATE;
 SELECT * INTO i FROM public.invoices WHERE id='4dfdf9c5-68e2-46c8-940a-afa2b520bc92' AND invoice_number='INV-70058' FOR UPDATE;
 SELECT id INTO rid FROM public.hotel_grooming_requests WHERE hotel_booking_id=h.id AND grooming_booking_id=g.id FOR UPDATE;
 IF q.id IS NULL OR h.id IS NULL OR g.id IS NULL OR i.id IS NULL OR rid IS NULL THEN RAISE EXCEPTION 'Correction records changed'; END IF;
 IF q.status<>'draft' OR q.converted_invoice_id IS NOT NULL OR h.invoice_id IS NOT NULL OR g.invoice_id IS DISTINCT FROM i.id OR i.status<>'draft' OR i.sent_at IS NOT NULL OR i.last_sent_at IS NOT NULL OR i.send_count<>0 OR i.xero_invoice_id IS NOT NULL OR i.amount_paid<>0 OR i.total<>222.50 THEN RAISE EXCEPTION 'Draft no longer safe to retire; no changes made'; END IF;
 IF EXISTS(SELECT 1 FROM public.payment_allocations WHERE invoice_id=i.id) OR EXISTS(SELECT 1 FROM public.credit_note_applications WHERE invoice_id=i.id) OR EXISTS(SELECT 1 FROM public.payments WHERE invoice_id=i.id) OR EXISTS(SELECT 1 FROM public.bookings WHERE invoice_id=i.id AND id<>g.id) OR EXISTS(SELECT 1 FROM public.invoice_items WHERE invoice_id=i.id AND booking_id IS DISTINCT FROM g.id) THEN RAISE EXCEPTION 'Draft has other financial links; no changes made'; END IF;
 UPDATE public.bookings SET parent_booking_id=h.id,invoice_id=NULL WHERE id=g.id;
 UPDATE public.invoices SET status='cancelled',scheduled_release_date=NULL,notes=coalesce(notes,'')||E'\nUnsent duplicate grooming draft retired: groom is included on hotel quote QU-4889 and its future combined invoice.' WHERE id=i.id;
 INSERT INTO public.invoice_events(tenant_id,invoice_id,event_type,actor_label,notes,payload) VALUES(i.tenant_id,i.id,'cancelled','System correction','Unsent hotel-groom draft replaced by combined hotel quote QU-4889.',jsonb_build_object('hotel_booking_id',h.id,'grooming_booking_id',g.id,'estimate_id',q.id));
 PERFORM public.hotel_quote_sync_grooms(q.id);
 IF (SELECT total FROM public.estimates WHERE id=q.id)<>10457.50 OR (SELECT count(*) FROM public.estimate_items WHERE estimate_id=q.id AND source_type='hotel_groom' AND source_id=rid)<>1 THEN RAISE EXCEPTION 'Corrected combined quote must be R10457.50 with one discounted groom'; END IF;
 IF public.ensure_booking_invoice(g.id) IS NOT NULL THEN RAISE EXCEPTION 'Corrected groom must not create another invoice'; END IF;
END $$;