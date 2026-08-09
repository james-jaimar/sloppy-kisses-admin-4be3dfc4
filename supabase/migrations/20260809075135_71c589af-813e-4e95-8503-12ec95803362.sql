CREATE OR REPLACE FUNCTION public.customer_addresses_one_primary()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.is_primary = true THEN
    UPDATE public.customer_addresses
    SET is_primary = false
    WHERE customer_id = NEW.customer_id
      AND id <> NEW.id
      AND is_primary = true;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS customer_addresses_one_primary_trigger ON public.customer_addresses;
CREATE TRIGGER customer_addresses_one_primary_trigger
AFTER INSERT OR UPDATE OF is_primary ON public.customer_addresses
FOR EACH ROW
EXECUTE FUNCTION public.customer_addresses_one_primary();

COMMENT ON FUNCTION public.customer_addresses_one_primary() IS 'Ensures only one customer address is marked primary per customer.';
