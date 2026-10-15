UPDATE public.xero_settings
SET default_sales_account = '1000/000',
    service_account_codes = jsonb_build_object(
      'daycare', '1020/000',
      'daycare_assessment', '1020/000',
      'hotel_dog', '1040/000',
      'hotel_cat', '1042/000',
      'grooming_inhouse', '1080/000',
      'grooming_mobile', '1081/000',
      'pickup_dropoff', '1000/010'
    ),
    updated_at = now();