GRANT EXECUTE ON FUNCTION public.hotel_house_availability(uuid, date, date, text) TO anon;

CREATE OR REPLACE FUNCTION public.public_tenant_info(p_slug text DEFAULT NULL)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object('id', t.id, 'name', t.name, 'slug', t.slug)
  FROM tenants t
  WHERE t.status = 'active'
    AND (p_slug IS NULL OR t.slug = lower(p_slug))
  ORDER BY t.created_at ASC
  LIMIT 1;
$$;
GRANT EXECUTE ON FUNCTION public.public_tenant_info(text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.public_hotel_rates(p_tenant_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'rates', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'species', r.species,
        'accommodation_type', r.accommodation_type,
        'display_name', r.display_name,
        'nightly_rate_zar', r.nightly_rate_zar,
        'extra_pet_rate_zar', r.extra_pet_rate_zar,
        'peak_uplift_pct', r.peak_uplift_pct,
        'min_size_band', r.min_size_band,
        'max_size_band', r.max_size_band
      ) ORDER BY r.sort_order, r.display_name)
      FROM hotel_rate_cards r
      WHERE r.tenant_id = p_tenant_id AND r.active
    ), '[]'::jsonb),
    'surcharges', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'code', s.code,
        'name', s.name,
        'price_zar', s.price_zar,
        'per_night', s.per_night
      ) ORDER BY s.sort_order, s.name)
      FROM hotel_surcharges s
      WHERE s.tenant_id = p_tenant_id AND s.active
    ), '[]'::jsonb)
  );
$$;
GRANT EXECUTE ON FUNCTION public.public_hotel_rates(uuid) TO anon, authenticated;