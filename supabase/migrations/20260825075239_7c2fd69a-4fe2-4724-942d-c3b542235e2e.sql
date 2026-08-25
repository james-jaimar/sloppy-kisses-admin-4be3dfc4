ALTER TABLE public.upload_sessions
  ADD COLUMN IF NOT EXISTS product_id uuid REFERENCES public.products(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS mode text NOT NULL DEFAULT 'single';

CREATE INDEX IF NOT EXISTS upload_sessions_product_idx ON public.upload_sessions(product_id);