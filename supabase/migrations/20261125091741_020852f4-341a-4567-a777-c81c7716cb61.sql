CREATE OR REPLACE FUNCTION hotel_private.hotel_review_action(p_booking_id uuid, p_action text, p_data jsonb DEFAULT '{}'::jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
#variable_conflict use_variable
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
 IF p_action='confirm' THEN
   IF r.confirmed_at IS NOT NULL THEN RETURN b.invoice_id; END IF;
   IF b.invoice_id IS NOT NULL OR r.verified_payment_id IS NOT NULL THEN RAISE EXCEPTION 'This stay already has an invoice; use its existing accounting workflow'; END IF;
   PERFORM set_config('hotel.confirming','on',true);
   e:=hotel_private.hotel_review_action(b.id,'approve',p_data);
   PERFORM set_config('hotel.confirming','',true);
   SELECT et.total INTO total FROM public.estimates et WHERE et.id=e;
   pct:=public.hotel_required_percent(COALESCE(b.start_date,(b.start_at AT TIME ZONE 'Africa/Johannesburg')::date),(now() AT TIME ZONE 'Africa/Johannesburg')::date,COALESCE(ws.payment_cutoff_days,30),COALESCE(ws.advance_deposit_pct,50),r.payment_percent_override);
   required:=ROUND(total*pct/100,2);
   UPDATE public.hotel_booking_reviews SET confirmed_at=now(),confirmed_by=auth.uid() WHERE booking_id=b.id;
   inv:=public.ensure_booking_invoice(b.id);
   IF inv IS NULL THEN RAISE EXCEPTION 'Could not issue the hotel invoice'; END IF;
   INSERT INTO public.invoice_items(tenant_id,invoice_id,booking_id,description,quantity,unit_price,line_total,sort_order,source_type,source_id)
     SELECT tenant_id,inv,b.id,description,quantity,unit_price,line_total,COALESCE(sort_order,0),'hotel_stay',b.id FROM public.estimate_items WHERE estimate_id=e;
   UPDATE public.invoices SET booking_id=b.id,deposit_due=required,deposit_due_date=CURRENT_DATE,
     due_date=GREATEST(CURRENT_DATE,COALESCE(b.start_date,CURRENT_DATE)-COALESCE(ws.payment_cutoff_days,30)) WHERE id=inv;
   UPDATE public.estimates SET converted_invoice_id=inv,status='accepted',accepted_at=COALESCE(accepted_at,now()) WHERE id=e;
   UPDATE public.bookings SET status='confirmed',payment_hold_expires_at=NULL WHERE id=b.id;
   RETURN inv;
 END IF;
 IF p_action='record_receipt' THEN
 IF NOT public.user_has_permission(b.tenant_id,'payments.create') THEN RAISE EXCEPTION 'Payment recording permission required'; END IF;
 IF r.verified_payment_id IS NOT NULL THEN RETURN b.invoice_id; END IF;
 IF r.confirmed_at IS NOT NULL THEN RAISE EXCEPTION 'This stay is invoiced; record the payment against its invoice'; END IF;
 IF r.approved_at IS NULL OR (p_data->>'amount')::numeric<=0 OR NULLIF(trim(p_data->>'reference'),'') IS NULL THEN RAISE EXCEPTION 'Approve the stay and provide a received amount and bank/till reference'; END IF;
 INSERT INTO public.payments(tenant_id,customer_id,amount,payment_method,payment_reference,paid_at,status,recorded_by)
 VALUES(b.tenant_id,b.customer_id,(p_data->>'amount')::numeric,(p_data->>'method')::public.payment_method,p_data->>'reference',now(),'received',public.current_profile_id()) RETURNING * INTO pay;
 RETURN hotel_private.hotel_review_action(b.id,'receipt',jsonb_build_object('payment_id',pay.id));
 END IF;
 IF p_action='save' OR p_action='needs_info' THEN
   IF r.confirmed_at IS NOT NULL OR r.verified_payment_id IS NOT NULL THEN RAISE EXCEPTION 'Confirmed stays must be amended through the booking and credit-note workflow'; END IF;
   IF r.estimate_id IS NOT NULL THEN UPDATE public.estimates SET status='expired',hold_until=NULL,hold_expires_at=NULL WHERE id=r.estimate_id AND converted_invoice_id IS NULL AND status<>'accepted'; END IF;
   IF p_data ? 'override_percent' THEN
     IF NOT public.user_has_permission(b.tenant_id,'settings.hotel.manage') THEN RAISE EXCEPTION 'Only hotel administrators may override payment terms'; END IF;
     pct:=(p_data->>'override_percent')::numeric;
     IF pct IS NOT NULL AND (pct<0 OR pct>100 OR NULLIF(trim(p_data->>'override_reason'),'') IS NULL) THEN RAISE EXCEPTION 'Use a percentage from 0 to 100 and give an override reason'; END IF;
     UPDATE public.hotel_booking_reviews SET payment_percent_override=pct,override_reason=p_data->>'override_reason' WHERE booking_id=b.id;
   END IF;
   UPDATE public.hotel_booking_reviews SET checklist=COALESCE(p_data->'checklist',checklist),customer_message=p_data->>'customer_message',collection_time=NULLIF(p_data->>'collection_time','')::time,estimate_id=CASE WHEN EXISTS(SELECT 1 FROM public.estimates et WHERE et.id=r.estimate_id AND et.status='accepted') THEN r.estimate_id ELSE NULL END,approved_at=NULL,approved_by=NULL WHERE booking_id=b.id;
   IF NULLIF(p_data->>'collection_time','') IS NOT NULL THEN UPDATE public.hotel_booking_details SET agreed_collection_time=(p_data->>'collection_time')::time WHERE booking_id=b.id; END IF;
   UPDATE public.bookings SET status=CASE WHEN p_action='needs_info' OR EXISTS(SELECT 1 FROM public.estimates et WHERE et.id=r.estimate_id AND et.status='accepted') THEN 'needs_info'::public.booking_status ELSE 'requested'::public.booking_status END WHERE id=b.id;
   IF p_action='needs_info' AND NULLIF(trim(p_data->>'customer_message'),'') IS NOT NULL THEN
     INSERT INTO public.notification_events(tenant_id,customer_id,booking_id,event_type,payload) VALUES(b.tenant_id,b.customer_id,b.id,'manual_message',jsonb_build_object('message',p_data->>'customer_message','body',p_data->>'customer_message','subject','Information needed for hotel stay '||b.booking_number));
   END IF;
   RETURN r.id;
 END IF;
 IF p_action IN ('estimate','approve') THEN
   IF b.invoice_id IS NOT NULL OR r.verified_payment_id IS NOT NULL OR r.confirmed_at IS NOT NULL THEN RAISE EXCEPTION 'This stay already has an invoice; use its existing accounting workflow'; END IF;
   IF p_action='approve' AND COALESCE(current_setting('hotel.confirming',true),'')<>'on' AND EXISTS (SELECT 1 FROM jsonb_array_elements(COALESCE(ws.approval_checklist,'[]')) c WHERE COALESCE((r.checklist->>(c->>'code'))::boolean,false)=false) THEN RAISE EXCEPTION 'Complete every approval check first'; END IF;
   IF h.id IS NULL OR NULLIF(h.accommodation_type,'') IS NULL THEN RAISE EXCEPTION 'Choose accommodation before creating the estimate'; END IF;
   st:=COALESCE(b.start_date,(b.start_at AT TIME ZONE 'Africa/Johannesburg')::date); en:=COALESCE(b.end_date,(b.end_at AT TIME ZONE 'Africa/Johannesburg')::date);
   IF st IS NULL OR en IS NULL OR en<=st THEN RAISE EXCEPTION 'Choose valid stay dates'; END IF;
   species:=CASE WHEN b.service_type='hotel_cat' THEN 'cat' ELSE 'dog' END;
   SELECT jsonb_agg(jsonb_build_object('name',p.name,'accommodation_type',COALESCE(bp.accommodation_type,h.accommodation_type))) INTO pets_json FROM public.booking_pets bp JOIN public.pets p ON p.id=bp.pet_id WHERE bp.booking_id=b.id;
   IF pets_json IS NULL THEN RAISE EXCEPTION 'Link at least one pet'; END IF;
   IF EXISTS(SELECT 1 FROM public.booking_pets bp JOIN public.pets p ON p.id=bp.pet_id WHERE bp.booking_id=b.id AND NOT EXISTS(SELECT 1 FROM public.hotel_rate_cards rc WHERE rc.tenant_id=b.tenant_id AND rc.active AND rc.species=p.species::text AND rc.accommodation_type=COALESCE(bp.accommodation_type,h.accommodation_type))) THEN RAISE EXCEPTION 'Every pet needs active accommodation matching its species'; END IF;
   pct:=public.hotel_required_percent(st,(now() AT TIME ZONE 'Africa/Johannesburg')::date,COALESCE(ws.payment_cutoff_days,30),COALESCE(ws.advance_deposit_pct,50),r.payment_percent_override);

   IF p_action='approve' AND EXISTS(SELECT 1 FROM public.estimates et WHERE et.id=r.estimate_id AND et.booking_id=b.id AND et.tenant_id=b.tenant_id AND et.created_via='hotel_sheet_import' AND et.extras ? 'legacy_hotel_import') THEN
     IF NOT EXISTS(SELECT 1 FROM public.estimates et WHERE et.id=r.estimate_id AND et.status='accepted') THEN RAISE EXCEPTION 'Customer acceptance of the imported quote is required'; END IF;
     IF EXISTS(SELECT 1 FROM public.estimates et WHERE et.id=r.estimate_id AND ((et.extras->'legacy_hotel_import'->>'start_date')::date<>st OR (et.extras->'legacy_hotel_import'->>'end_date')::date<>en OR et.pet_ids IS DISTINCT FROM ARRAY(SELECT bp.pet_id FROM public.booking_pets bp WHERE bp.booking_id=b.id ORDER BY bp.sort_order,bp.created_at))) THEN RAISE EXCEPTION 'Imported stay changed; review a replacement quote before confirming'; END IF;
     e:=r.estimate_id;
     UPDATE public.hotel_booking_reviews SET approved_at=now(),approved_by=public.current_profile_id() WHERE booking_id=b.id;
     RETURN e;
   END IF;
   INSERT INTO public.estimates(tenant_id,customer_id,estimate_number,status,issue_date,expiry_date,service_type,start_at,end_at,accommodation_type,pet_ids,booking_id,extras,notes)
   VALUES(b.tenant_id,b.customer_id,public.next_estimate_number(b.tenant_id),'draft',CURRENT_DATE,CURRENT_DATE+COALESCE(ws.quote_validity_days,14),b.service_type,b.start_at,b.end_at,h.accommodation_type,ARRAY(SELECT pet_id FROM public.booking_pets WHERE booking_id=b.id),b.id,jsonb_build_object('document_kind',CASE WHEN p_action='approve' THEN 'proforma' ELSE 'estimate' END,'payment_percent',pct,'collection_time',r.collection_time),'Hotel stay '||b.booking_number||'. Not a tax invoice.') RETURNING id INTO e;
   FOR line IN SELECT * FROM public.hotel_booking_stay_lines(b.id) LOOP
     INSERT INTO public.estimate_items(tenant_id,estimate_id,booking_id,description,quantity,unit_price,line_total) VALUES(b.tenant_id,e,b.id,line.description,line.quantity,ROUND(line.unit_price*(1-LEAST(100,COALESCE(h.discount_pct,0)+CASE WHEN ws.long_stay_min_nights IS NOT NULL AND en-st>=ws.long_stay_min_nights THEN COALESCE(ws.long_stay_discount_pct,0) ELSE 0 END)/100),2),ROUND(line.line_total*(1-LEAST(100,COALESCE(h.discount_pct,0)+CASE WHEN ws.long_stay_min_nights IS NOT NULL AND en-st>=ws.long_stay_min_nights THEN COALESCE(ws.long_stay_discount_pct,0) ELSE 0 END)/100),2));
   END LOOP;
   INSERT INTO public.estimate_items(tenant_id,estimate_id,booking_id,description,quantity,unit_price,line_total) SELECT b.tenant_id,e,b.id,s.name,bs.quantity*CASE WHEN s.per_night AND bs.quantity_basis<>'total' THEN en-st ELSE 1 END,COALESCE(bs.price_override_zar,s.price_zar),ROUND(bs.quantity*CASE WHEN s.per_night AND bs.quantity_basis<>'total' THEN en-st ELSE 1 END*COALESCE(bs.price_override_zar,s.price_zar),2) FROM public.hotel_booking_surcharges bs JOIN public.hotel_surcharges s ON s.id=bs.surcharge_id WHERE bs.booking_id=b.id;
   
   INSERT INTO public.estimate_items(tenant_id,estimate_id,booking_id,description,quantity,unit_price,line_total)
   SELECT b.tenant_id,e,b.id,
     COALESCE(gr.pet_name,'Pet')||' — departure groom: '||gp.name||CASE WHEN COALESCE(ws.checkout_groom_discount_pct,0)>0 THEN ' ('||trim(to_char(ws.checkout_groom_discount_pct,'FM990.##'))||'% stay discount)' ELSE '' END,
     1, ROUND(gp.price_zar*(1-LEAST(100,GREATEST(0,COALESCE(ws.checkout_groom_discount_pct,0)))/100),2),
     ROUND(gp.price_zar*(1-LEAST(100,GREATEST(0,COALESCE(ws.checkout_groom_discount_pct,0)))/100),2)
   FROM public.hotel_grooming_requests gr JOIN public.grooming_packages gp ON gp.id=gr.package_id AND gp.tenant_id=b.tenant_id
   WHERE gr.hotel_booking_id=b.id AND gr.status IN ('pending','scheduled');
   INSERT INTO public.estimate_items(tenant_id,estimate_id,booking_id,description,quantity,unit_price,line_total)
   SELECT b.tenant_id,e,b.id,COALESCE(gr.pet_name,'Pet')||' — groom extra: '||ga.name,1,
     CASE WHEN gp.package_type='full' AND ga.code IN ('teeth_gel','nails_trim','nail_trim','ear_clean','anal_gland','hygiene_cut','hand_strip','shampoo_hypo','shampoo_tick_flea','shampoo_deshed','shampoo_whitening') THEN 0 ELSE ga.price_zar END,
     CASE WHEN gp.package_type='full' AND ga.code IN ('teeth_gel','nails_trim','nail_trim','ear_clean','anal_gland','hygiene_cut','hand_strip','shampoo_hypo','shampoo_tick_flea','shampoo_deshed','shampoo_whitening') THEN 0 ELSE ga.price_zar END
   FROM public.hotel_grooming_requests gr
   JOIN public.grooming_addons ga ON ga.id=ANY(gr.addon_ids) AND ga.tenant_id=b.tenant_id
   LEFT JOIN public.grooming_packages gp ON gp.id=gr.package_id
   WHERE gr.hotel_booking_id=b.id AND gr.status IN ('pending','scheduled');
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
   IF r.confirmed_at IS NOT NULL THEN RAISE EXCEPTION 'This stay is invoiced; record the payment against its invoice'; END IF;
   IF r.approved_at IS NULL OR r.estimate_id IS NULL THEN RAISE EXCEPTION 'Approve a pro forma first'; END IF;
   SELECT * INTO pay FROM public.payments WHERE id=(p_data->>'payment_id')::uuid FOR UPDATE;
   IF pay.id IS NULL OR pay.tenant_id<>b.tenant_id OR pay.customer_id<>b.customer_id OR pay.status<>'received' OR COALESCE(pay.amount_refunded,0)<>0 OR pay.invoice_id IS NOT NULL OR pay.amount<=0 OR EXISTS(SELECT 1 FROM public.payment_allocations WHERE payment_id=pay.id) THEN RAISE EXCEPTION 'Choose an unallocated received payment for this customer'; END IF;
   SELECT et.total INTO total FROM public.estimates et WHERE et.id=r.estimate_id;
   pct:=public.hotel_required_percent(COALESCE(b.start_date,(b.start_at AT TIME ZONE 'Africa/Johannesburg')::date),(now() AT TIME ZONE 'Africa/Johannesburg')::date,COALESCE(ws.payment_cutoff_days,30),COALESCE(ws.advance_deposit_pct,50),r.payment_percent_override);
   required:=ROUND(total*pct/100,2);
   IF pay.amount>total THEN RAISE EXCEPTION 'Receipt exceeds this pro forma total; record the excess separately as customer credit'; END IF;
   IF pay.amount<required THEN RAISE EXCEPTION 'Received payment is below the current required amount (%)',required; END IF;
   UPDATE public.hotel_booking_reviews SET verified_payment_id=pay.id WHERE booking_id=b.id;
   inv:=public.ensure_booking_invoice(b.id);
   INSERT INTO public.invoice_items(tenant_id,invoice_id,booking_id,description,quantity,unit_price,line_total,sort_order,source_type,source_id) SELECT tenant_id,inv,b.id,description,quantity,unit_price,line_total,sort_order,'hotel_stay',b.id FROM public.estimate_items WHERE estimate_id=r.estimate_id;
   UPDATE public.invoices SET booking_id=b.id,deposit_due=required,deposit_due_date=CURRENT_DATE,due_date=GREATEST(CURRENT_DATE,COALESCE(b.start_date,CURRENT_DATE)-COALESCE(ws.payment_cutoff_days,30)) WHERE id=inv;
   PERFORM public.allocate_payment(pay.id,jsonb_build_array(jsonb_build_object('invoice_id',inv,'amount',pay.amount)));
   UPDATE public.estimates SET converted_invoice_id=inv WHERE id=r.estimate_id;
   UPDATE public.bookings SET status='confirmed',payment_hold_expires_at=NULL WHERE id=b.id;
   RETURN inv;
 END IF;
 RAISE EXCEPTION 'Unknown review action';
END $function$;

CREATE OR REPLACE FUNCTION public.hotel_checkin_vaccination_gate() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_missing text;
BEGIN
  IF NEW.service_type NOT IN ('hotel_dog','hotel_cat') OR NEW.status <> 'checked_in' OR OLD.status = 'checked_in' OR NEW.vax_override_by IS NOT NULL THEN RETURN NEW; END IF;
  SELECT string_agg(DISTINCT g.pet_name || ' (' || g.label || ')', ', ') INTO v_missing
  FROM public.booking_vaccination_gate(NEW.id) g WHERE g.status IN ('missing','expired','no_certificate');
  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'Check-in blocked: vaccinations not cleared for %. Upload valid certificates or ask a manager to override.', v_missing;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.hotel_checkin_vaccination_gate() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS zz_hotel_checkin_vaccination_gate ON public.bookings;
CREATE TRIGGER zz_hotel_checkin_vaccination_gate BEFORE UPDATE OF status ON public.bookings FOR EACH ROW EXECUTE FUNCTION public.hotel_checkin_vaccination_gate();