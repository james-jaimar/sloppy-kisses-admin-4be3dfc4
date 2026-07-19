-- Prevent NEW duplicate customer emails per-tenant while tolerating existing dupes.
CREATE OR REPLACE FUNCTION public.customers_prevent_duplicate_email()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing_before int;
  v_existing_after int;
BEGIN
  IF NEW.email IS NULL OR length(trim(NEW.email)) = 0 THEN
    RETURN NEW;
  END IF;
  IF coalesce(NEW.status::text, 'active') = 'archived' THEN
    RETURN NEW;
  END IF;

  -- Count OTHER active/inactive rows in same tenant with same lowercased email
  SELECT count(*) INTO v_existing_after
  FROM public.customers
  WHERE tenant_id = NEW.tenant_id
    AND id <> NEW.id
    AND email IS NOT NULL
    AND lower(email) = lower(NEW.email)
    AND coalesce(status::text, 'active') <> 'archived';

  IF v_existing_after = 0 THEN
    RETURN NEW;
  END IF;

  -- On UPDATE where email didn't change, allow (pre-existing duplicate)
  IF TG_OP = 'UPDATE' AND OLD.email IS NOT NULL AND lower(OLD.email) = lower(NEW.email) THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'email_already_in_use'
    USING ERRCODE = 'unique_violation',
          HINT = 'A customer with this email already exists in this tenant.';
END;
$$;

DROP TRIGGER IF EXISTS trg_customers_prevent_duplicate_email ON public.customers;
CREATE TRIGGER trg_customers_prevent_duplicate_email
  BEFORE INSERT OR UPDATE OF email, status ON public.customers
  FOR EACH ROW EXECUTE FUNCTION public.customers_prevent_duplicate_email();

-- Helper: return customers in tenant that share an email with the given customer
CREATE OR REPLACE FUNCTION public.find_customer_email_duplicates(target_customer_id uuid)
RETURNS TABLE(id uuid, full_name text, customer_number text, email text, status text)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT c.id, c.full_name, c.customer_number, c.email, c.status::text
  FROM public.customers c
  WHERE c.tenant_id = (SELECT tenant_id FROM public.customers WHERE id = target_customer_id)
    AND c.id <> target_customer_id
    AND c.email IS NOT NULL
    AND lower(c.email) = (SELECT lower(email) FROM public.customers WHERE id = target_customer_id)
    AND public.user_has_tenant_access(c.tenant_id);
$$;

REVOKE EXECUTE ON FUNCTION public.find_customer_email_duplicates(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.find_customer_email_duplicates(uuid) TO authenticated;