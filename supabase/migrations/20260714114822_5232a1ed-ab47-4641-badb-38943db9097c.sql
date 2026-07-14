
-- Re-grant EXECUTE on RLS-helper functions to authenticated (and anon where needed).
-- These are invoked from inside RLS policies and evaluated as the CALLING role,
-- so the calling role needs EXECUTE even though the functions are SECURITY DEFINER.

GRANT EXECUTE ON FUNCTION public.is_platform_owner() TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_has_tenant_access(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_customer_id(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_can_access_customer(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_can_access_pet(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_has_permission(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_profile_id() TO authenticated;

-- tenant_gateway_enabled is also read from the public invoice page (anon).
GRANT EXECUTE ON FUNCTION public.tenant_gateway_enabled(uuid, text) TO authenticated, anon;

-- log_invoice_event is invoked by SECURITY DEFINER triggers (which run as their
-- owner and don't need this), but also referenced from user-facing RPCs like
-- apply_credit_note / allocate_customer_credit — grant to authenticated to be safe.
GRANT EXECUTE ON FUNCTION public.log_invoice_event(uuid, uuid, text, jsonb, text) TO authenticated;

-- _customer_notify_status is called by SECURITY DEFINER triggers only; no grant needed.

-- Widen the tenant-branding SELECT policy so customers can see their own tenant's
-- logo/favicon (BrandingProvider is mounted app-wide, including on customer routes).
DROP POLICY IF EXISTS "Tenant members can read branding" ON storage.objects;
DROP POLICY IF EXISTS "Read tenant branding" ON storage.objects;

CREATE POLICY "Read tenant branding"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'tenant-branding'
  AND (
    public.user_has_tenant_access(((storage.foldername(name))[1])::uuid)
    OR public.current_customer_id(((storage.foldername(name))[1])::uuid) IS NOT NULL
  )
);
