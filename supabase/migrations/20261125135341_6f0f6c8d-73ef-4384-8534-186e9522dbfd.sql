REVOKE ALL ON FUNCTION public.estimates_mark_billed_grooms() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.hotel_groom_requests_quote_sync() FROM PUBLIC, anon, authenticated;
CREATE INDEX IF NOT EXISTS hotel_grooming_requests_billed_invoice_idx ON public.hotel_grooming_requests(billed_invoice_id);