create function public.preview_daycare_free_groom(p_tenant uuid,p_pet uuid,p_day date,p_exclude_booking uuid default null) returns boolean language plpgsql security definer set search_path=public as $$ begin
if not public.user_has_tenant_access(p_tenant) and not exists(select 1 from public.pets p where p.id=p_pet and p.tenant_id=p_tenant and p.customer_id=public.current_customer_id(p_tenant)) then raise exception 'Not authorised'; end if;
if not exists(select 1 from public.pets where id=p_pet and tenant_id=p_tenant) then return false; end if;
return public.daycare_free_groom_available(p_tenant,p_pet,p_day,p_exclude_booking); end $$;
revoke all on function public.preview_daycare_free_groom(uuid,uuid,date,uuid) from public,anon;
grant execute on function public.preview_daycare_free_groom(uuid,uuid,date,uuid) to authenticated,service_role;