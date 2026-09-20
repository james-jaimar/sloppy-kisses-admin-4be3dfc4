
DROP FUNCTION IF EXISTS public.export_customers_for_xero(uuid, boolean);

CREATE OR REPLACE FUNCTION public.export_customers_for_xero(p_tenant_id uuid, p_active_only boolean DEFAULT true)
 RETURNS TABLE(sk_number text, original_xero_name text, first_name text, last_name text, full_name text, email text, mobile text, phone_alt text, address_line_1 text, address_line_2 text, suburb text, city text, province text, postcode text, status text, customer_types text, pet_count bigint, date_added date)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    c.customer_number,
    COALESCE(r.xero_customer_id, c.xero_customer_id),
    c.first_name,
    c.last_name,
    c.full_name,
    c.email,
    c.mobile,
    c.phone_alt,
    c.address_line_1,
    c.address_line_2,
    c.suburb,
    c.city,
    c.province,
    c.postcode,
    c.status::text,
    array_to_string(c.customer_types, ', '),
    (SELECT count(*) FROM public.pets p WHERE p.customer_id = c.id),
    c.created_at::date
  FROM public.customers c
  LEFT JOIN public.import_customers_raw r ON r.customer_id = c.customer_number
  WHERE c.tenant_id = p_tenant_id
    AND public.user_has_permission(p_tenant_id, 'reports.view')
    AND (NOT p_active_only OR c.status::text = 'active')
  ORDER BY c.customer_number;
$function$;

REVOKE ALL ON FUNCTION public.export_customers_for_xero(uuid, boolean) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.export_customers_for_xero(uuid, boolean) TO authenticated, service_role;
