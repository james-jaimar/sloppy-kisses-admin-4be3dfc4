
ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS customer_types text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS customer_types_excluded text[] NOT NULL DEFAULT '{}';

CREATE OR REPLACE FUNCTION public.customer_type_for_service(p_service service_type)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE p_service
    WHEN 'daycare' THEN 'daycare'
    WHEN 'daycare_assessment' THEN 'daycare'
    WHEN 'hotel_dog' THEN 'hotel'
    WHEN 'hotel_cat' THEN 'cattery'
    WHEN 'grooming_inhouse' THEN 'grooming'
    WHEN 'grooming_mobile' THEN 'mobile_grooming'
    WHEN 'pickup_dropoff' THEN 'transport'
    ELSE NULL
  END
$$;

CREATE OR REPLACE FUNCTION public.bookings_tag_customer_type()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_type text;
BEGIN
  IF NEW.customer_id IS NULL THEN RETURN NEW; END IF;
  v_type := public.customer_type_for_service(NEW.service_type);
  IF v_type IS NULL THEN RETURN NEW; END IF;

  UPDATE public.customers c
     SET customer_types = array_append(c.customer_types, v_type)
   WHERE c.id = NEW.customer_id
     AND NOT (v_type = ANY (c.customer_types))
     AND NOT (v_type = ANY (c.customer_types_excluded));

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS bookings_tag_customer_type_ins ON public.bookings;
CREATE TRIGGER bookings_tag_customer_type_ins
AFTER INSERT ON public.bookings
FOR EACH ROW EXECUTE FUNCTION public.bookings_tag_customer_type();

DROP TRIGGER IF EXISTS bookings_tag_customer_type_upd ON public.bookings;
CREATE TRIGGER bookings_tag_customer_type_upd
AFTER UPDATE OF service_type, customer_id ON public.bookings
FOR EACH ROW EXECUTE FUNCTION public.bookings_tag_customer_type();

-- One-off backfill from existing bookings
WITH derived AS (
  SELECT b.customer_id,
         array_agg(DISTINCT public.customer_type_for_service(b.service_type)) AS types
    FROM public.bookings b
   WHERE b.customer_id IS NOT NULL
     AND public.customer_type_for_service(b.service_type) IS NOT NULL
   GROUP BY b.customer_id
)
UPDATE public.customers c
   SET customer_types = (
     SELECT COALESCE(array_agg(DISTINCT t ORDER BY t), '{}')
       FROM unnest(c.customer_types || d.types) AS t
      WHERE t IS NOT NULL
        AND NOT (t = ANY (c.customer_types_excluded))
   )
  FROM derived d
 WHERE d.customer_id = c.id;

-- Shop customers from completed till sales
WITH shoppers AS (
  SELECT DISTINCT i.customer_id
    FROM public.invoices i
   WHERE i.customer_id IS NOT NULL
     AND EXISTS (
       SELECT 1 FROM public.invoice_items ii
        WHERE ii.invoice_id = i.id AND ii.product_id IS NOT NULL
     )
)
UPDATE public.customers c
   SET customer_types = array_append(c.customer_types, 'shop')
  FROM shoppers s
 WHERE s.customer_id = c.id
   AND NOT ('shop' = ANY (c.customer_types))
   AND NOT ('shop' = ANY (c.customer_types_excluded));

-- Second contacts
CREATE TABLE IF NOT EXISTS public.customer_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  full_name text NOT NULL,
  relationship text,
  mobile text,
  email text,
  receives_emails boolean NOT NULL DEFAULT true,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS customer_contacts_customer_idx ON public.customer_contacts(customer_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.customer_contacts TO authenticated;
GRANT ALL ON public.customer_contacts TO service_role;

ALTER TABLE public.customer_contacts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS customer_contacts_staff_all ON public.customer_contacts;
CREATE POLICY customer_contacts_staff_all ON public.customer_contacts
  FOR ALL TO authenticated
  USING (user_has_tenant_access(tenant_id))
  WITH CHECK (user_has_tenant_access(tenant_id));

DROP POLICY IF EXISTS customer_contacts_customer_select_own ON public.customer_contacts;
CREATE POLICY customer_contacts_customer_select_own ON public.customer_contacts
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.customers c
     WHERE c.id = customer_contacts.customer_id
       AND c.linked_profile_id = current_profile_id()
       AND c.portal_access_enabled = true
  ));

DROP TRIGGER IF EXISTS customer_contacts_updated_at ON public.customer_contacts;
CREATE TRIGGER customer_contacts_updated_at
BEFORE UPDATE ON public.customer_contacts
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Swap the account holder with a second contact
CREATE OR REPLACE FUNCTION public.swap_customer_account_holder(p_contact_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_contact public.customer_contacts%ROWTYPE;
  v_cust public.customers%ROWTYPE;
BEGIN
  SELECT * INTO v_contact FROM public.customer_contacts WHERE id = p_contact_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Contact not found'; END IF;

  IF NOT public.user_has_tenant_access(v_contact.tenant_id) THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;

  SELECT * INTO v_cust FROM public.customers WHERE id = v_contact.customer_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Customer not found'; END IF;

  UPDATE public.customers
     SET first_name = split_part(v_contact.full_name, ' ', 1),
         last_name  = NULLIF(regexp_replace(v_contact.full_name, '^\S+\s*', ''), ''),
         full_name  = v_contact.full_name,
         email      = v_contact.email,
         mobile     = v_contact.mobile,
         updated_at = now()
   WHERE id = v_cust.id;

  UPDATE public.customer_contacts
     SET full_name = COALESCE(v_cust.full_name, trim(coalesce(v_cust.first_name,'') || ' ' || coalesce(v_cust.last_name,''))),
         email     = v_cust.email,
         mobile    = v_cust.mobile,
         updated_at = now()
   WHERE id = p_contact_id;
END;
$$;

REVOKE ALL ON FUNCTION public.swap_customer_account_holder(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.swap_customer_account_holder(uuid) TO authenticated;
