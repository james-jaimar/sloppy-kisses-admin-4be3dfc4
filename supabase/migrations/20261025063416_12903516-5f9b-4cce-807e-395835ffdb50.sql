ALTER TABLE public.hotel_workflow_settings ADD COLUMN payment_cutoff_days integer NOT NULL DEFAULT 30, ADD COLUMN advance_deposit_pct numeric NOT NULL DEFAULT 50, ADD COLUMN approval_checklist jsonb NOT NULL DEFAULT '[{"code":"vaccinations","label":"Vaccination cards received and checked"},{"code":"owner_details","label":"Owner and emergency details complete"},{"code":"care","label":"Feeding, medication and tick/flea details reviewed"},{"code":"terms","label":"Accommodation form and terms received"}]';
CREATE TABLE public.hotel_booking_reviews (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES public.tenants(id), booking_id uuid NOT NULL UNIQUE REFERENCES public.bookings(id) ON DELETE CASCADE, checklist jsonb NOT NULL DEFAULT '{}', customer_message text, approved_at timestamptz, approved_by uuid, estimate_id uuid REFERENCES public.estimates(id), payment_percent_override numeric, override_reason text, verified_payment_id uuid REFERENCES public.payments(id), collection_time time, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
GRANT SELECT ON public.hotel_booking_reviews TO authenticated;
GRANT ALL ON public.hotel_booking_reviews TO service_role;
ALTER TABLE public.hotel_booking_reviews ENABLE ROW LEVEL SECURITY;
CREATE POLICY hotel_reviews_staff ON public.hotel_booking_reviews FOR SELECT TO authenticated USING (public.user_has_tenant_access(tenant_id));
CREATE POLICY hotel_reviews_customer ON public.hotel_booking_reviews FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.bookings b WHERE b.id=booking_id AND b.customer_id=public.current_customer_id(b.tenant_id)));
CREATE TRIGGER hotel_reviews_updated BEFORE UPDATE ON public.hotel_booking_reviews FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE FUNCTION public.hotel_required_percent(p_start date,p_today date,p_cutoff integer DEFAULT 30,p_deposit numeric DEFAULT 50,p_override numeric DEFAULT NULL) RETURNS numeric LANGUAGE sql IMMUTABLE SET search_path=public AS $$ SELECT COALESCE(p_override,CASE WHEN p_start-p_today > p_cutoff THEN p_deposit ELSE 100 END) $$;
REVOKE ALL ON FUNCTION public.hotel_required_percent(date,date,integer,numeric,numeric) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.hotel_required_percent(date,date,integer,numeric,numeric) TO authenticated,service_role;
ALTER FUNCTION public.ensure_booking_invoice(uuid) RENAME TO ensure_booking_invoice_before_hotel_review;
REVOKE ALL ON FUNCTION public.ensure_booking_invoice_before_hotel_review(uuid) FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.ensure_booking_invoice(p_booking_id uuid) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE b public.bookings; BEGIN SELECT * INTO b FROM public.bookings WHERE id=p_booking_id; IF b.id IS NULL THEN RETURN NULL; END IF; IF b.invoice_id IS NOT NULL THEN RETURN b.invoice_id; END IF; IF b.service_type IN ('hotel_dog','hotel_cat') AND NOT EXISTS (SELECT 1 FROM public.hotel_booking_reviews r JOIN public.payments p ON p.id=r.verified_payment_id WHERE r.booking_id=b.id AND p.amount>0 AND p.tenant_id=b.tenant_id AND p.customer_id=b.customer_id) THEN RETURN NULL; END IF; RETURN public.ensure_booking_invoice_before_hotel_review(p_booking_id); END $$;
REVOKE ALL ON FUNCTION public.ensure_booking_invoice(uuid) FROM PUBLIC,anon,authenticated; GRANT EXECUTE ON FUNCTION public.ensure_booking_invoice(uuid) TO service_role;
CREATE FUNCTION public.hotel_review_action(p_booking_id uuid,p_action text,p_data jsonb DEFAULT '{}') RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE b public.bookings; r public.hotel_booking_reviews; h public.hotel_booking_details; ws public.hotel_workflow_settings; e uuid; pct numeric; total numeric; line record; pets_json jsonb; species text; st date; en date; pay public.payments; inv uuid; required numeric;
BEGIN
 SELECT * INTO b FROM public.bookings WHERE id=p_booking_id FOR UPDATE;
 IF b.id IS NULL OR b.service_type NOT IN ('hotel_dog','hotel_cat') THEN RAISE EXCEPTION 'Hotel booking not found'; END IF;
 IF NOT public.user_has_permission(b.tenant_id,'bookings.edit') THEN RAISE EXCEPTION 'Booking edit permission required'; END IF;
 INSERT INTO public.hotel_booking_reviews(tenant_id,booking_id) VALUES(b.tenant_id,b.id) ON CONFLICT(booking_id) DO NOTHING;
 SELECT * INTO r FROM public.hotel_booking_reviews WHERE booking_id=b.id FOR UPDATE;
 SELECT * INTO h FROM public.hotel_booking_details WHERE booking_id=b.id;
 SELECT * INTO ws FROM public.hotel_workflow_settings WHERE tenant_id=b.tenant_id;
 IF b.status IN ('cancelled','no_show','completed','checked_out') THEN RAISE EXCEPTION 'This stay is closed'; END IF;
 IF p_action='save' OR p_action='needs_info' THEN
   IF r.verified_payment_id IS NOT NULL THEN RAISE EXCEPTION 'Paid stays must be amended through the booking and credit-note workflow'; END IF;
   IF p_data ? 'override_percent' THEN
     IF NOT public.user_has_permission(b.tenant_id,'settings.hotel.manage') THEN RAISE EXCEPTION 'Only hotel administrators may override payment terms'; END IF;
     pct:=(p_data->>'override_percent')::numeric;
     IF pct IS NOT NULL AND (pct<0 OR pct>100 OR NULLIF(trim(p_data->>'override_reason'),'') IS NULL) THEN RAISE EXCEPTION 'Use a percentage from 0 to 100 and give an override reason'; END IF;
     UPDATE public.hotel_booking_reviews SET payment_percent_override=pct,override_reason=p_data->>'override_reason' WHERE booking_id=b.id;
   END IF;
   UPDATE public.hotel_booking_reviews SET checklist=COALESCE(p_data->'checklist',checklist),customer_message=p_data->>'customer_message',collection_time=NULLIF(p_data->>'collection_time','')::time,approved_at=NULL,approved_by=NULL WHERE booking_id=b.id;
   UPDATE public.bookings SET status=CASE WHEN p_action='needs_info' THEN 'needs_info'::public.booking_status ELSE 'requested'::public.booking_status END WHERE id=b.id;
   IF p_action='needs_info' AND NULLIF(trim(p_data->>'customer_message'),'') IS NOT NULL THEN
     INSERT INTO public.notification_events(tenant_id,customer_id,booking_id,event_type,payload) VALUES(b.tenant_id,b.customer_id,b.id,'manual_message',jsonb_build_object('message',p_data->>'customer_message','body',p_data->>'customer_message','subject','Information needed for hotel stay '||b.booking_number));
   END IF;
   RETURN r.id;
 END IF;
 IF p_action IN ('estimate','approve') THEN
   IF b.invoice_id IS NOT NULL OR r.verified_payment_id IS NOT NULL THEN RAISE EXCEPTION 'This stay already has an invoice; use its existing accounting workflow'; END IF;
   IF p_action='approve' AND EXISTS (SELECT 1 FROM jsonb_array_elements(COALESCE(ws.approval_checklist,'[]')) c WHERE COALESCE((r.checklist->>(c->>'code'))::boolean,false)=false) THEN RAISE EXCEPTION 'Complete every approval check first'; END IF;
   IF h.id IS NULL OR NULLIF(h.accommodation_type,'') IS NULL THEN RAISE EXCEPTION 'Choose accommodation before creating the estimate'; END IF;
   st:=COALESCE(b.start_date,(b.start_at AT TIME ZONE 'Africa/Johannesburg')::date); en:=COALESCE(b.end_date,(b.end_at AT TIME ZONE 'Africa/Johannesburg')::date);
   IF st IS NULL OR en IS NULL OR en<=st THEN RAISE EXCEPTION 'Choose valid stay dates'; END IF;
   species:=CASE WHEN b.service_type='hotel_cat' THEN 'cat' ELSE 'dog' END;
   SELECT jsonb_agg(jsonb_build_object('name',p.name,'accommodation_type',COALESCE(bp.accommodation_type,h.accommodation_type))) INTO pets_json FROM public.booking_pets bp JOIN public.pets p ON p.id=bp.pet_id WHERE bp.booking_id=b.id;
   IF pets_json IS NULL THEN RAISE EXCEPTION 'Link at least one pet'; END IF;
   pct:=public.hotel_required_percent(st,(now() AT TIME ZONE 'Africa/Johannesburg')::date,COALESCE(ws.payment_cutoff_days,30),COALESCE(ws.advance_deposit_pct,50),r.payment_percent_override);
   INSERT INTO public.estimates(tenant_id,customer_id,estimate_number,status,issue_date,expiry_date,service_type,start_at,end_at,accommodation_type,pet_ids,booking_id,extras,notes)
   VALUES(b.tenant_id,b.customer_id,public.next_estimate_number(b.tenant_id),'draft',CURRENT_DATE,CURRENT_DATE+COALESCE(ws.quote_validity_days,14),b.service_type,b.start_at,b.end_at,h.accommodation_type,ARRAY(SELECT pet_id FROM public.booking_pets WHERE booking_id=b.id),b.id,jsonb_build_object('document_kind',CASE WHEN p_action='approve' THEN 'proforma' ELSE 'estimate' END,'payment_percent',pct,'collection_time',r.collection_time),'Hotel stay '||b.booking_number||'. Not a tax invoice.') RETURNING id INTO e;
   FOR line IN SELECT * FROM public.hotel_stay_lines_pets(b.tenant_id,species,st,en,pets_json) LOOP
     INSERT INTO public.estimate_items(tenant_id,estimate_id,booking_id,description,quantity,unit_price,line_total) VALUES(b.tenant_id,e,b.id,line.description,line.quantity,ROUND(line.unit_price*(1-LEAST(100,COALESCE(h.discount_pct,0)+CASE WHEN ws.long_stay_min_nights IS NOT NULL AND en-st>=ws.long_stay_min_nights THEN COALESCE(ws.long_stay_discount_pct,0) ELSE 0 END)/100),2),ROUND(line.line_total*(1-LEAST(100,COALESCE(h.discount_pct,0)+CASE WHEN ws.long_stay_min_nights IS NOT NULL AND en-st>=ws.long_stay_min_nights THEN COALESCE(ws.long_stay_discount_pct,0) ELSE 0 END)/100),2));
   END LOOP;
   INSERT INTO public.estimate_items(tenant_id,estimate_id,booking_id,description,quantity,unit_price,line_total) SELECT b.tenant_id,e,b.id,s.name,bs.quantity*CASE WHEN s.per_night THEN en-st ELSE 1 END,COALESCE(bs.price_override_zar,s.price_zar),ROUND(bs.quantity*CASE WHEN s.per_night THEN en-st ELSE 1 END*COALESCE(bs.price_override_zar,s.price_zar),2) FROM public.hotel_booking_surcharges bs JOIN public.hotel_surcharges s ON s.id=bs.surcharge_id WHERE bs.booking_id=b.id;
   SELECT COALESCE(SUM(line_total),0) INTO total FROM public.estimate_items WHERE estimate_id=e;
   IF total<=0 THEN RAISE EXCEPTION 'No priced stay lines; check the rate settings'; END IF;
   UPDATE public.estimates SET subtotal=total,total=total,extras=extras||jsonb_build_object('payment_due',ROUND(total*pct/100,2)) WHERE id=e;
   UPDATE public.hotel_booking_reviews SET estimate_id=e,approved_at=CASE WHEN p_action='approve' THEN now() ELSE NULL END,approved_by=CASE WHEN p_action='approve' THEN auth.uid() ELSE NULL END WHERE booking_id=b.id;
   UPDATE public.bookings SET status=CASE WHEN p_action='approve' THEN 'pending_payment'::public.booking_status ELSE 'requested'::public.booking_status END,payment_hold_expires_at=NULL WHERE id=b.id;
   RETURN e;
 END IF;
 IF p_action='receipt' THEN
   IF NOT public.user_has_permission(b.tenant_id,'payments.create') THEN RAISE EXCEPTION 'Payment recording permission required'; END IF;
   IF r.verified_payment_id IS NOT NULL THEN RETURN b.invoice_id; END IF;
   IF r.approved_at IS NULL OR r.estimate_id IS NULL THEN RAISE EXCEPTION 'Approve a pro forma first'; END IF;
   SELECT * INTO pay FROM public.payments WHERE id=(p_data->>'payment_id')::uuid FOR UPDATE;
   IF pay.id IS NULL OR pay.tenant_id<>b.tenant_id OR pay.customer_id<>b.customer_id OR pay.amount<=0 OR EXISTS(SELECT 1 FROM public.payment_allocations WHERE payment_id=pay.id) THEN RAISE EXCEPTION 'Choose an unallocated received payment for this customer'; END IF;
   SELECT et.total INTO total FROM public.estimates et WHERE et.id=r.estimate_id;
   pct:=public.hotel_required_percent(COALESCE(b.start_date,(b.start_at AT TIME ZONE 'Africa/Johannesburg')::date),(now() AT TIME ZONE 'Africa/Johannesburg')::date,COALESCE(ws.payment_cutoff_days,30),COALESCE(ws.advance_deposit_pct,50),r.payment_percent_override);
   required:=ROUND(total*pct/100,2);
   IF pay.amount<required THEN RAISE EXCEPTION 'Received payment is below the current required amount (%)',required; END IF;
   UPDATE public.hotel_booking_reviews SET verified_payment_id=pay.id WHERE booking_id=b.id;
   inv:=public.ensure_booking_invoice(b.id);
   INSERT INTO public.invoice_items(tenant_id,invoice_id,booking_id,description,quantity,unit_price,line_total,sort_order,source_type,source_id) SELECT tenant_id,inv,b.id,description,quantity,unit_price,line_total,sort_order,'hotel_stay',b.id FROM public.estimate_items WHERE estimate_id=r.estimate_id;
   UPDATE public.invoices SET booking_id=b.id,deposit_due=required,deposit_due_date=CURRENT_DATE,due_date=GREATEST(CURRENT_DATE,COALESCE(b.start_date,CURRENT_DATE)-COALESCE(ws.payment_cutoff_days,30)) WHERE id=inv;
   PERFORM public.allocate_payment(pay.id,jsonb_build_array(jsonb_build_object('invoice_id',inv,'amount',LEAST(pay.amount,total))));
   UPDATE public.estimates SET converted_invoice_id=inv WHERE id=r.estimate_id;
   UPDATE public.bookings SET status='confirmed',payment_hold_expires_at=NULL WHERE id=b.id;
   RETURN inv;
 END IF;
 RAISE EXCEPTION 'Unknown review action';
END $$;
REVOKE ALL ON FUNCTION public.hotel_review_action(uuid,text,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.hotel_review_action(uuid,text,jsonb) TO authenticated;
