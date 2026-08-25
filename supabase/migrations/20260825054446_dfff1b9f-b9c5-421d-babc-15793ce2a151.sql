CREATE OR REPLACE FUNCTION public.complete_pos_sale(
  p_tenant_id uuid,
  p_customer_id uuid,
  p_location_id uuid,
  p_lines jsonb,
  p_tenders jsonb DEFAULT '[]'::jsonb,
  p_discount numeric DEFAULT 0,
  p_till_name text DEFAULT NULL,
  p_notes text DEFAULT NULL
)
RETURNS TABLE (
  invoice_id uuid,
  invoice_number text,
  total numeric,
  paid numeric,
  change numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invoice_id uuid;
  v_invoice_number text;
  v_profile_id uuid;
  v_line jsonb;
  v_tender jsonb;
  v_product public.products%ROWTYPE;
  v_stock_movement_id uuid;
  v_qty numeric;
  v_unit_price numeric;
  v_discount numeric := round(coalesce(p_discount, 0), 2);
  v_invoice_total numeric := 0;
  v_paid numeric := 0;
  v_change numeric := 0;
  v_amount numeric;
  v_tendered numeric;
  v_method public.payment_method;
  v_sort integer := 0;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'You must be signed in to complete a till sale' USING ERRCODE = '42501';
  END IF;

  IF NOT public.user_has_tenant_access(p_tenant_id)
     OR NOT public.user_has_permission(p_tenant_id, 'pos.operate') THEN
    RAISE EXCEPTION 'You do not have permission to operate this till' USING ERRCODE = '42501';
  END IF;

  IF p_lines IS NULL OR jsonb_typeof(p_lines) <> 'array' OR jsonb_array_length(p_lines) = 0 THEN
    RAISE EXCEPTION 'Cart is empty' USING ERRCODE = '22023';
  END IF;

  IF jsonb_array_length(p_lines) > 250 THEN
    RAISE EXCEPTION 'A till sale cannot contain more than 250 lines' USING ERRCODE = '22023';
  END IF;

  IF p_tenders IS NULL OR jsonb_typeof(p_tenders) <> 'array' THEN
    RAISE EXCEPTION 'Tenders must be an array' USING ERRCODE = '22023';
  END IF;

  IF jsonb_array_length(p_tenders) > 20 THEN
    RAISE EXCEPTION 'A till sale cannot contain more than 20 tenders' USING ERRCODE = '22023';
  END IF;

  IF v_discount < 0 OR v_discount > 1000000 THEN
    RAISE EXCEPTION 'Discount amount is invalid' USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.customers c
    WHERE c.id = p_customer_id AND c.tenant_id = p_tenant_id
  ) THEN
    RAISE EXCEPTION 'The selected customer does not belong to this business' USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.stock_locations sl
    WHERE sl.id = p_location_id AND sl.tenant_id = p_tenant_id
  ) THEN
    RAISE EXCEPTION 'The selected stock location does not belong to this business' USING ERRCODE = '22023';
  END IF;

  SELECT p.id INTO v_profile_id
  FROM public.profiles p
  WHERE p.auth_user_id = auth.uid()
  LIMIT 1;

  v_invoice_number := public.next_invoice_number(p_tenant_id);

  INSERT INTO public.invoices (
    tenant_id, customer_id, invoice_number, status,
    issue_date, due_date, notes, created_by
  ) VALUES (
    p_tenant_id,
    p_customer_id,
    v_invoice_number,
    'draft'::public.billing_status,
    current_date,
    current_date,
    coalesce(nullif(btrim(p_notes), ''), 'Retail sale' || CASE WHEN nullif(btrim(p_till_name), '') IS NOT NULL THEN ' · ' || btrim(p_till_name) ELSE '' END),
    v_profile_id
  )
  RETURNING id INTO v_invoice_id;

  FOR v_line IN SELECT value FROM jsonb_array_elements(p_lines)
  LOOP
    IF NOT (v_line ? 'product_id') OR NOT (v_line ? 'qty') OR NOT (v_line ? 'unit_price') THEN
      RAISE EXCEPTION 'Every sale line requires a product, quantity and unit price' USING ERRCODE = '22023';
    END IF;

    BEGIN
      v_qty := (v_line->>'qty')::numeric;
      v_unit_price := (v_line->>'unit_price')::numeric;
    EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
      RAISE EXCEPTION 'A sale line has an invalid quantity or price' USING ERRCODE = '22023';
    END;

    IF v_qty = 0 OR trunc(v_qty) <> v_qty OR abs(v_qty) > 10000 THEN
      RAISE EXCEPTION 'Sale quantities must be non-zero whole numbers' USING ERRCODE = '22023';
    END IF;

    IF v_unit_price < 0 OR v_unit_price > 1000000 THEN
      RAISE EXCEPTION 'A sale line has an invalid unit price' USING ERRCODE = '22023';
    END IF;

    SELECT pr.* INTO v_product
    FROM public.products pr
    WHERE pr.id = (v_line->>'product_id')::uuid
      AND pr.tenant_id = p_tenant_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'A selected product does not belong to this business' USING ERRCODE = '22023';
    END IF;

    INSERT INTO public.stock_movements (
      tenant_id, product_id, location_id, qty_delta,
      reason, ref_type, ref_id, created_by
    ) VALUES (
      p_tenant_id,
      v_product.id,
      p_location_id,
      -v_qty,
      CASE WHEN v_qty < 0 THEN 'return'::public.stock_movement_reason ELSE 'sale'::public.stock_movement_reason END,
      'invoice',
      v_invoice_id,
      auth.uid()
    )
    RETURNING id INTO v_stock_movement_id;

    INSERT INTO public.invoice_items (
      tenant_id, invoice_id, description, quantity, unit_price,
      product_id, stock_movement_id, sort_order, vat_rate, vat_inclusive
    ) VALUES (
      p_tenant_id,
      v_invoice_id,
      v_product.name || CASE WHEN v_product.sku IS NOT NULL THEN ' (' || v_product.sku || ')' ELSE '' END,
      v_qty,
      v_unit_price,
      v_product.id,
      v_stock_movement_id,
      v_sort,
      v_product.vat_rate,
      true
    );

    v_sort := v_sort + 1;
  END LOOP;

  SELECT i.total INTO v_invoice_total
  FROM public.invoices i
  WHERE i.id = v_invoice_id;

  IF v_discount > v_invoice_total THEN
    RAISE EXCEPTION 'Discount cannot exceed the sale total' USING ERRCODE = '22023';
  END IF;

  IF v_discount > 0 THEN
    INSERT INTO public.invoice_items (
      tenant_id, invoice_id, description, quantity, unit_price,
      sort_order, vat_rate, vat_inclusive
    ) VALUES (
      p_tenant_id,
      v_invoice_id,
      'Discount',
      1,
      -v_discount,
      v_sort,
      0,
      true
    );
  END IF;

  SELECT i.total INTO v_invoice_total
  FROM public.invoices i
  WHERE i.id = v_invoice_id;

  FOR v_tender IN SELECT value FROM jsonb_array_elements(p_tenders)
  LOOP
    IF NOT (v_tender ? 'method') OR NOT (v_tender ? 'amount') THEN
      RAISE EXCEPTION 'Every tender requires a payment method and amount' USING ERRCODE = '22023';
    END IF;

    BEGIN
      v_method := (v_tender->>'method')::public.payment_method;
      v_amount := round((v_tender->>'amount')::numeric, 2);
      v_tendered := CASE
        WHEN v_tender ? 'tendered' AND v_tender->>'tendered' IS NOT NULL
          THEN round((v_tender->>'tendered')::numeric, 2)
        ELSE NULL
      END;
    EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
      RAISE EXCEPTION 'A tender has an invalid payment method or amount' USING ERRCODE = '22023';
    END;

    IF v_amount <= 0 OR v_amount > 1000000 THEN
      RAISE EXCEPTION 'Tender amounts must be greater than zero' USING ERRCODE = '22023';
    END IF;

    IF v_tendered IS NOT NULL AND (v_tendered < v_amount OR v_tendered > 1000000) THEN
      RAISE EXCEPTION 'Cash tendered cannot be less than the payment amount' USING ERRCODE = '22023';
    END IF;

    v_paid := v_paid + v_amount;
    IF v_tendered IS NOT NULL THEN
      v_change := v_change + greatest(0, v_tendered - v_amount);
    END IF;
  END LOOP;

  IF jsonb_array_length(p_tenders) > 0 AND v_paid < v_invoice_total THEN
    RAISE EXCEPTION 'Payment is short by R %', to_char(v_invoice_total - v_paid, 'FM999999990.00') USING ERRCODE = '22023';
  END IF;

  IF v_paid > v_invoice_total THEN
    RAISE EXCEPTION 'Payment amount exceeds the sale total' USING ERRCODE = '22023';
  END IF;

  UPDATE public.invoices
  SET status = 'sent'::public.billing_status
  WHERE id = v_invoice_id;

  FOR v_tender IN SELECT value FROM jsonb_array_elements(p_tenders)
  LOOP
    v_method := (v_tender->>'method')::public.payment_method;
    v_amount := round((v_tender->>'amount')::numeric, 2);

    INSERT INTO public.payments (
      tenant_id, invoice_id, customer_id, amount,
      payment_method, payment_reference, paid_at, status,
      recorded_by
    ) VALUES (
      p_tenant_id,
      v_invoice_id,
      p_customer_id,
      v_amount,
      v_method,
      nullif(btrim(v_tender->>'reference'), ''),
      now(),
      'received',
      v_profile_id
    );
  END LOOP;

  SELECT i.total, i.amount_paid
  INTO v_invoice_total, v_paid
  FROM public.invoices i
  WHERE i.id = v_invoice_id;

  RETURN QUERY
  SELECT v_invoice_id, v_invoice_number, v_invoice_total, v_paid, round(v_change, 2);
END;
$$;

REVOKE ALL ON FUNCTION public.complete_pos_sale(uuid, uuid, uuid, jsonb, jsonb, numeric, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.complete_pos_sale(uuid, uuid, uuid, jsonb, jsonb, numeric, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.complete_pos_sale(uuid, uuid, uuid, jsonb, jsonb, numeric, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.complete_pos_sale(uuid, uuid, uuid, jsonb, jsonb, numeric, text, text) TO service_role;