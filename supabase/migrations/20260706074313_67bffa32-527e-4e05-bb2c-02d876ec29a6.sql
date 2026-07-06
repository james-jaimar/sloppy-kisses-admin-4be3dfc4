
CREATE OR REPLACE FUNCTION public.next_booking_number(target_tenant_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  next_num integer;
begin
  perform pg_advisory_xact_lock(hashtext(target_tenant_id::text || ':booking_number'));

  select coalesce(
    max(
      nullif(regexp_replace(booking_number, '[^0-9]', '', 'g'), '')::integer
    ),
    0
  ) + 1
  into next_num
  from public.bookings
  where tenant_id = target_tenant_id
    and booking_number ~ '^BK[0-9]+$';

  return 'BK' || lpad(next_num::text, 5, '0');
end;
$function$;
