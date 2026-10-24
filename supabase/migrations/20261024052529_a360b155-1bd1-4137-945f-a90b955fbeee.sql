alter table public.daycare_plans add column free_grooms_per_month integer not null default 0;
create function public.validate_daycare_groom_allowance() returns trigger language plpgsql set search_path=public as $$ begin if new.free_grooms_per_month < 0 or new.free_grooms_per_month > 31 then raise exception 'Monthly free grooms must be between 0 and 31.'; end if; return new; end $$;
revoke all on function public.validate_daycare_groom_allowance() from public,anon,authenticated;
create trigger validate_daycare_groom_allowance before insert or update on public.daycare_plans for each row execute function public.validate_daycare_groom_allowance();
create function public.daycare_free_groom_available(p_tenant uuid,p_pet uuid,p_day date,p_exclude_booking uuid default null) returns boolean language plpgsql security definer set search_path=public as $$ declare allowance integer; used integer; begin
select max(dp.free_grooms_per_month) into allowance from public.daycare_enrolments e join public.daycare_plans dp on dp.id=e.daycare_plan_id and dp.tenant_id=e.tenant_id where e.tenant_id=p_tenant and e.pet_id=p_pet and e.active and dp.active and e.start_date<=p_day and (e.end_date is null or e.end_date>=p_day) and not(e.paused_from is not null and p_day between e.paused_from and coalesce(e.paused_to,p_day));
if coalesce(allowance,0)=0 then return false; end if;
select count(distinct b.id) into used from public.bookings b join public.booking_pets bp on bp.booking_id=b.id join public.invoice_items i on i.booking_id=b.id where b.tenant_id=p_tenant and bp.pet_id=p_pet and b.service_type='grooming_inhouse' and b.status not in ('cancelled','no_show') and b.id is distinct from p_exclude_booking and date_trunc('month',b.start_at at time zone 'Africa/Johannesburg')=date_trunc('month',p_day::timestamp) and i.description like '%monthly daycare free groom%' and i.discount_pct=100;
return used<allowance; end $$;
revoke all on function public.daycare_free_groom_available(uuid,uuid,date,uuid) from public,anon,authenticated;
grant execute on function public.daycare_free_groom_available(uuid,uuid,date,uuid) to service_role;
create function public.apply_grooming_price_list_rules() returns trigger language plpgsql security definer set search_path=public as $$ declare b public.bookings; d public.grooming_booking_details; w public.grooming_workflow_settings; pet uuid; day date; code text; begin
if new.booking_id is null then return new; end if;
select * into b from public.bookings where id=new.booking_id;
if b.service_type not in ('grooming_inhouse','grooming_mobile') then return new; end if;
select * into d from public.grooming_booking_details where booking_id=b.id;
select * into w from public.grooming_workflow_settings where tenant_id=b.tenant_id;
day:=(b.start_at at time zone 'Africa/Johannesburg')::date;
if new.description like 'Grooming — %' then
if coalesce(d.pensioner_discount,false) and not(extract(dow from day)::integer=any(coalesce(w.pensioner_discount_days,array[1,3]))) then
new.discount_pct:=greatest(coalesce((select greatest(a.puppy_pct,a.daycare_pct) from public.grooming_auto_discount(b.id) a),0),coalesce(public.grooming_checkout_discount_pct(b.id),0),coalesce(d.hotel_checkout_discount_pct,0));
new.description:=regexp_replace(new.description,' · pensioner discount −[^%]*%',''); end if;
select pet_id into pet from public.booking_pets where booking_id=b.id order by created_at limit 1;
if b.service_type='grooming_inhouse' and pet is not null and d.package_id is not null then
perform pg_advisory_xact_lock(hashtextextended(b.tenant_id::text||pet::text||date_trunc('month',day)::text,0));
if public.daycare_free_groom_available(b.tenant_id,pet,day,b.id) then new.discount_pct:=100; new.description:=regexp_replace(new.description,' · [^·]*discount −[^%]*%','')||' · monthly daycare free groom'; end if;
end if;
elsif new.item_code like 'GROOM_ADDON:%' then
code:=substring(new.item_code from 13);
if code in ('teeth_gel','nails_trim','nail_trim','ear_clean','anal_gland','hygiene_cut','hand_strip','shampoo_hypo','shampoo_tick_flea','shampoo_deshed','shampoo_whitening') and exists(select 1 from public.grooming_packages p where p.id=d.package_id and p.package_type='full') then new.unit_price:=0; end if;
end if;
return new; end $$;
revoke all on function public.apply_grooming_price_list_rules() from public,anon,authenticated;
create trigger apply_grooming_price_list_rules before insert on public.invoice_items for each row execute function public.apply_grooming_price_list_rules();