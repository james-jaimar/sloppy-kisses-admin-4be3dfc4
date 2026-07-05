DROP POLICY IF EXISTS profiles_select_own_or_tenant ON public.profiles;

CREATE POLICY profiles_select_own_or_tenant ON public.profiles
FOR SELECT
USING (
  auth_user_id = auth.uid()
  OR public.is_platform_owner()
  OR EXISTS (
    SELECT 1
    FROM public.tenant_users tu_self
    JOIN public.tenant_users tu_other
      ON tu_other.tenant_id = tu_self.tenant_id
    WHERE tu_self.profile_id = public.current_profile_id()
      AND tu_other.profile_id = profiles.id
  )
);