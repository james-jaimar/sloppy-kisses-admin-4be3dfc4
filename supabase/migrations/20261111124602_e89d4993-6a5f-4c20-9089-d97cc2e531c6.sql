ALTER TABLE public.hotel_grooming_requests ADD COLUMN IF NOT EXISTS addon_ids uuid[] NOT NULL DEFAULT '{}';

DO $migration$
DECLARE d text; anchor text := 'SELECT COALESCE(SUM(line_total),0) INTO total FROM public.estimate_items WHERE estimate_id=e;';
groom text := $g$
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
   $g$;
BEGIN
 d := pg_get_functiondef('hotel_private.hotel_review_action(uuid,text,jsonb)'::regprocedure);
 IF strpos(d,anchor)=0 THEN RAISE EXCEPTION 'estimate total anchor not found'; END IF;
 d := replace(d, anchor, groom || anchor);
 EXECUTE d;

 d := pg_get_functiondef('public.schedule_hotel_groom(uuid,timestamp with time zone,timestamp with time zone,uuid,uuid,text)'::regprocedure);
 anchor := 'UPDATE public.bookings SET requires_grooming = true WHERE id = v_r.hotel_booking_id;';
 IF strpos(d,anchor)=0 THEN RAISE EXCEPTION 'schedule anchor not found'; END IF;
 d := replace(d, anchor, $s$INSERT INTO public.grooming_booking_addons(tenant_id,booking_id,addon_id,addon_code,addon_name,qty,price_zar_snapshot)
    SELECT v_r.tenant_id,v_booking_id,ga.id,ga.code,ga.name,1,ga.price_zar FROM public.grooming_addons ga
    WHERE ga.id=ANY(v_r.addon_ids) AND ga.tenant_id=v_r.tenant_id;
  $s$ || anchor);
 EXECUTE d;
END $migration$;