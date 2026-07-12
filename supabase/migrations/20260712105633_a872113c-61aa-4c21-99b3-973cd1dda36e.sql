-- ============================================================
-- Section A1: granular invoicing permissions + RLS split
-- ============================================================

-- 1. New permission codes
INSERT INTO public.permissions (code, label, description) VALUES
  ('invoices.send',        'Send invoices',           'Email or mark an invoice as sent'),
  ('invoices.void',        'Void invoices',           'Void (cancel) an issued invoice'),
  ('invoices.delete',      'Delete draft invoices',   'Permanently delete a draft invoice'),
  ('payments.refund',      'Refund payments',         'Record a refund against a payment'),
  ('credit_notes.issue',   'Issue credit notes',      'Create a credit note against an invoice'),
  ('credit_notes.refund',  'Refund credit notes',     'Refund a credit note back to the customer')
ON CONFLICT (code) DO NOTHING;

-- 2. Seed role_permissions
-- Full power roles: platform_owner, tenant_owner, tenant_admin -> all new perms
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
CROSS JOIN public.permissions p
WHERE r.code IN ('platform_owner','tenant_owner','tenant_admin')
  AND p.code IN ('invoices.send','invoices.void','invoices.delete',
                 'payments.refund','credit_notes.issue','credit_notes.refund')
ON CONFLICT DO NOTHING;

-- Accounts staff: everything except delete
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
CROSS JOIN public.permissions p
WHERE r.code = 'staff_accounts'
  AND p.code IN ('invoices.send','invoices.void',
                 'payments.refund','credit_notes.issue','credit_notes.refund')
ON CONFLICT DO NOTHING;

-- 3. Split RLS on invoices
DROP POLICY IF EXISTS invoices_staff_all ON public.invoices;

CREATE POLICY invoices_staff_select ON public.invoices
  FOR SELECT USING (
    public.user_has_tenant_access(tenant_id)
    AND public.user_has_permission(tenant_id, 'invoices.view')
  );

CREATE POLICY invoices_staff_insert ON public.invoices
  FOR INSERT WITH CHECK (
    public.user_has_tenant_access(tenant_id)
    AND public.user_has_permission(tenant_id, 'invoices.create')
  );

CREATE POLICY invoices_staff_update ON public.invoices
  FOR UPDATE USING (
    public.user_has_tenant_access(tenant_id)
    AND (
      public.user_has_permission(tenant_id, 'invoices.update')
      OR public.user_has_permission(tenant_id, 'invoices.send')
      OR public.user_has_permission(tenant_id, 'invoices.void')
      OR public.user_has_permission(tenant_id, 'invoices.mark_paid')
    )
  ) WITH CHECK (
    public.user_has_tenant_access(tenant_id)
  );

CREATE POLICY invoices_staff_delete ON public.invoices
  FOR DELETE USING (
    public.user_has_tenant_access(tenant_id)
    AND public.user_has_permission(tenant_id, 'invoices.delete')
  );

-- 4. Split RLS on invoice_items
DROP POLICY IF EXISTS invoice_items_staff_all ON public.invoice_items;

CREATE POLICY invoice_items_staff_select ON public.invoice_items
  FOR SELECT USING (
    public.user_has_tenant_access(tenant_id)
    AND public.user_has_permission(tenant_id, 'invoices.view')
  );

CREATE POLICY invoice_items_staff_write ON public.invoice_items
  FOR ALL USING (
    public.user_has_tenant_access(tenant_id)
    AND (
      public.user_has_permission(tenant_id, 'invoices.create')
      OR public.user_has_permission(tenant_id, 'invoices.update')
    )
  ) WITH CHECK (
    public.user_has_tenant_access(tenant_id)
    AND (
      public.user_has_permission(tenant_id, 'invoices.create')
      OR public.user_has_permission(tenant_id, 'invoices.update')
    )
  );

-- 5. Split RLS on payments
DROP POLICY IF EXISTS payments_staff_all ON public.payments;

CREATE POLICY payments_staff_select ON public.payments
  FOR SELECT USING (
    public.user_has_tenant_access(tenant_id)
    AND public.user_has_permission(tenant_id, 'payments.view')
  );

CREATE POLICY payments_staff_insert ON public.payments
  FOR INSERT WITH CHECK (
    public.user_has_tenant_access(tenant_id)
    AND (
      public.user_has_permission(tenant_id, 'payments.create')
      OR public.user_has_permission(tenant_id, 'payments.refund')
    )
  );

CREATE POLICY payments_staff_update ON public.payments
  FOR UPDATE USING (
    public.user_has_tenant_access(tenant_id)
    AND (
      public.user_has_permission(tenant_id, 'payments.create')
      OR public.user_has_permission(tenant_id, 'payments.refund')
    )
  ) WITH CHECK (public.user_has_tenant_access(tenant_id));

CREATE POLICY payments_staff_delete ON public.payments
  FOR DELETE USING (
    public.user_has_tenant_access(tenant_id)
    AND public.user_has_permission(tenant_id, 'payments.refund')
  );